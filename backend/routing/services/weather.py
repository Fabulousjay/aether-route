
from datetime import datetime, timedelta, timezone
from math import asin, cos, isfinite, radians, sin, sqrt

import requests


OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

HOURLY_VARIABLES = [
    "wind_gusts_10m",
    "precipitation",
    "rain",
    "snowfall",
]

REQUEST_TIMEOUT = 20
MAX_TIMELINE_HOURS = 48
MAX_CORRIDOR_SAMPLES = 9
MAX_ROUTE_COORDINATES = 20000


class WeatherServiceError(Exception):
    pass


def parse_utc_datetime(value):
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(
                value.replace("Z", "+00:00")
            )
        except ValueError as error:
            raise WeatherServiceError(
                "Invalid forecast date and time."
            ) from error
    else:
        raise WeatherServiceError(
            "Forecast date and time must be a datetime."
        )

    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise WeatherServiceError(
            "Forecast date and time must include a timezone."
        )

    return parsed.astimezone(timezone.utc)


def parse_forecast_times(hourly):
    times = []

    for value in hourly["time"]:
        try:
            parsed = datetime.fromisoformat(
                value.replace("Z", "+00:00")
            )
        except (TypeError, AttributeError, ValueError) as error:
            raise WeatherServiceError(
                "Weather provider returned an invalid timestamp."
            ) from error

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)

        times.append(parsed.astimezone(timezone.utc))

    return times


def numeric_value(hourly, field, index):
    value = hourly[field][index]

    if value is None:
        return None

    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    return number if isfinite(number) else None


def weather_at_index(hourly, index):
    snowfall_cm = numeric_value(hourly, "snowfall", index)

    return {
        "wind_gust_mph": numeric_value(
            hourly,
            "wind_gusts_10m",
            index,
        ),
        "precipitation_inches_per_hour": numeric_value(
            hourly,
            "precipitation",
            index,
        ),
        "rain_inches_per_hour": numeric_value(
            hourly,
            "rain",
            index,
        ),
        "snowfall_inches_per_hour": (
            round(snowfall_cm / 2.54, 3)
            if snowfall_cm is not None
            else None
        ),
    }


def fetch_hourly_forecast(latitude, longitude, session=None):
    client = session or requests

    try:
        response = client.get(
            OPEN_METEO_URL,
            params={
                "latitude": latitude,
                "longitude": longitude,
                "hourly": ",".join(HOURLY_VARIABLES),
                "wind_speed_unit": "mph",
                "precipitation_unit": "inch",
                "temperature_unit": "fahrenheit",
                "timezone": "GMT",
                "forecast_days": 16,
            },
            timeout=REQUEST_TIMEOUT,
        )

        response.raise_for_status()
        data = response.json()

    except (requests.RequestException, ValueError) as error:
        raise WeatherServiceError(
            "Unable to retrieve weather forecast."
        ) from error

    if not isinstance(data, dict):
        raise WeatherServiceError(
            "Weather provider returned an invalid response."
        )

    if data.get("error"):
        raise WeatherServiceError(
            data.get(
                "reason",
                "Weather provider returned an error.",
            )
        )

    hourly = data.get("hourly")

    if not isinstance(hourly, dict):
        raise WeatherServiceError(
            "Weather provider returned no hourly forecast."
        )

    required = ["time", *HOURLY_VARIABLES]

    for field in required:
        if not isinstance(hourly.get(field), list):
            raise WeatherServiceError(
                f"Weather forecast is missing {field}."
            )

    lengths = {
        len(hourly[field])
        for field in required
    }

    if len(lengths) != 1 or not hourly["time"]:
        raise WeatherServiceError(
            "Weather forecast contains inconsistent hourly data."
        )

    return hourly


def select_forecast_hour(hourly, arrival_time):
    arrival = parse_utc_datetime(arrival_time)
    forecast_times = parse_forecast_times(hourly)

    first_time = forecast_times[0]
    last_time = forecast_times[-1]

    if (
        arrival < first_time
        or arrival > last_time + timedelta(hours=1)
    ):
        raise WeatherServiceError(
            "Checkpoint arrival is outside the available forecast window."
        )

    index = min(
        range(len(forecast_times)),
        key=lambda position: abs(
            (forecast_times[position] - arrival).total_seconds()
        ),
    )

    return {
        "forecast_time": forecast_times[index].isoformat(),
        "wind_gust_mph": numeric_value(
            hourly,
            "wind_gusts_10m",
            index,
        ),
        "precipitation_inches": numeric_value(
            hourly,
            "precipitation",
            index,
        ),
        "rain_inches": numeric_value(
            hourly,
            "rain",
            index,
        ),
        "snowfall_cm": numeric_value(
            hourly,
            "snowfall",
            index,
        ),
    }


def analyze_checkpoint_weather(checkpoint, session=None):
    hourly = fetch_hourly_forecast(
        checkpoint["latitude"],
        checkpoint["longitude"],
        session=session,
    )

    forecast = select_forecast_hour(
        hourly,
        checkpoint["arrival_time"],
    )

    snowfall_cm = forecast["snowfall_cm"]

    snowfall_inches = (
        round(snowfall_cm / 2.54, 3)
        if snowfall_cm is not None
        else None
    )

    return {
        "checkpoint_id": checkpoint["id"],
        "latitude": checkpoint["latitude"],
        "longitude": checkpoint["longitude"],
        "arrival_time": checkpoint["arrival_time"],
        "forecast_time": forecast["forecast_time"],
        "weather": {
            "wind_gust_mph": forecast["wind_gust_mph"],
            "precipitation_inches_per_hour": forecast[
                "precipitation_inches"
            ],
            "rain_inches_per_hour": forecast["rain_inches"],
            "snowfall_inches_per_hour": snowfall_inches,
        },
        "provider": "Open-Meteo",
    }


def analyze_route_weather(checkpoints, session=None):
    results = []

    for checkpoint in checkpoints:
        results.append(
            analyze_checkpoint_weather(
                checkpoint,
                session=session,
            )
        )

    return results


def get_weather_timeline(
    latitude,
    longitude,
    start_time,
    hours=48,
    session=None,
):
    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except (TypeError, ValueError) as error:
        raise WeatherServiceError(
            "Invalid forecast coordinates."
        ) from error

    if (
        not isfinite(latitude)
        or not isfinite(longitude)
        or not -90 <= latitude <= 90
        or not -180 <= longitude <= 180
    ):
        raise WeatherServiceError(
            "Forecast coordinates are outside valid ranges."
        )

    if (
        isinstance(hours, bool)
        or not isinstance(hours, int)
        or not 1 <= hours <= MAX_TIMELINE_HOURS
    ):
        raise WeatherServiceError(
            "Timeline duration must be between 1 and 48 hours."
        )

    start = parse_utc_datetime(start_time)
    end = start + timedelta(hours=hours)

    hourly = fetch_hourly_forecast(
        latitude,
        longitude,
        session=session,
    )

    forecast_times = parse_forecast_times(hourly)

    if (
        start < forecast_times[0]
        or end > forecast_times[-1]
    ):
        raise WeatherServiceError(
            "The requested timeline is outside the available forecast window."
        )

    frames = []

    for index, forecast_time in enumerate(forecast_times):
        if start <= forecast_time <= end:
            frames.append({
                "forecast_time": forecast_time.isoformat(),
                "weather": weather_at_index(hourly, index),
            })

    if not frames:
        raise WeatherServiceError(
            "No hourly forecasts are available in the requested window."
        )

    return {
        "latitude": latitude,
        "longitude": longitude,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "duration_hours": hours,
        "forecast_interval": "hourly",
        "frames": frames,
        "frame_count": len(frames),
        "provider": "Open-Meteo",
    }


def haversine_miles(first, second):
    lon1, lat1 = first
    lon2, lat2 = second

    latitude_delta = radians(lat2 - lat1)
    longitude_delta = radians(lon2 - lon1)

    value = (
        sin(latitude_delta / 2) ** 2
        + cos(radians(lat1))
        * cos(radians(lat2))
        * sin(longitude_delta / 2) ** 2
    )

    return 3958.7613 * 2 * asin(min(1, sqrt(value)))


def validate_route_geometry(geometry):
    if not isinstance(geometry, dict):
        raise WeatherServiceError(
            "Route geometry must be a GeoJSON LineString."
        )

    if geometry.get("type") != "LineString":
        raise WeatherServiceError(
            "Route geometry must be a GeoJSON LineString."
        )

    coordinates = geometry.get("coordinates")

    if (
        not isinstance(coordinates, list)
        or not 2 <= len(coordinates) <= MAX_ROUTE_COORDINATES
    ):
        raise WeatherServiceError(
            "Route geometry must contain between 2 and 20,000 points."
        )

    validated = []

    for coordinate in coordinates:
        if (
            not isinstance(coordinate, (list, tuple))
            or len(coordinate) < 2
        ):
            raise WeatherServiceError(
                "Route geometry contains an invalid coordinate."
            )

        try:
            longitude = float(coordinate[0])
            latitude = float(coordinate[1])
        except (TypeError, ValueError) as error:
            raise WeatherServiceError(
                "Route geometry contains an invalid coordinate."
            ) from error

        if (
            not isfinite(latitude)
            or not isfinite(longitude)
            or not -90 <= latitude <= 90
            or not -180 <= longitude <= 180
        ):
            raise WeatherServiceError(
                "Route geometry contains coordinates outside valid ranges."
            )

        validated.append([longitude, latitude])

    return validated


def sample_route_points(coordinates, count):
    cumulative = [0.0]

    for index in range(1, len(coordinates)):
        cumulative.append(
            cumulative[-1]
            + haversine_miles(
                coordinates[index - 1],
                coordinates[index],
            )
        )

    total = cumulative[-1]

    if total <= 0:
        raise WeatherServiceError(
            "Route geometry must cover a nonzero distance."
        )

    samples = []
    segment = 1

    for index in range(count):
        fraction = index / (count - 1)
        target = total * fraction

        while (
            segment < len(cumulative) - 1
            and cumulative[segment] < target
        ):
            segment += 1

        previous = segment - 1
        start = cumulative[previous]
        end = cumulative[segment]

        ratio = (
            (target - start) / (end - start)
            if end > start
            else 0.0
        )

        first = coordinates[previous]
        second = coordinates[segment]

        longitude = first[0] + (
            second[0] - first[0]
        ) * ratio

        latitude = first[1] + (
            second[1] - first[1]
        ) * ratio

        samples.append({
            "id": f"sample-{index + 1}",
            "index": index,
            "fraction": round(fraction, 6),
            "distance_miles": round(target, 2),
            "latitude": round(latitude, 6),
            "longitude": round(longitude, 6),
        })

    return samples


def weather_intensity(weather):
    wind = weather["wind_gust_mph"]
    rain = weather["rain_inches_per_hour"]
    snow = weather["snowfall_inches_per_hour"]

    if wind is None and rain is None and snow is None:
        return "Unavailable"

    wind = wind or 0
    rain = rain or 0
    snow = snow or 0

    if wind >= 50 or rain >= 0.5 or snow >= 1:
        return "Extreme"

    if wind >= 35 or rain >= 0.2 or snow >= 0.4:
        return "Heavy"

    if wind >= 20 or rain >= 0.05 or snow >= 0.1:
        return "Moderate"

    return "Light"


def get_corridor_weather(
    geometry,
    start_time,
    hours=48,
    sample_count=7,
    session=None,
):
    coordinates = validate_route_geometry(geometry)

    if (
        isinstance(sample_count, bool)
        or not isinstance(sample_count, int)
        or not 2 <= sample_count <= MAX_CORRIDOR_SAMPLES
    ):
        raise WeatherServiceError(
            "Sample count must be between 2 and 9."
        )

    if (
        isinstance(hours, bool)
        or not isinstance(hours, int)
        or not 1 <= hours <= MAX_TIMELINE_HOURS
    ):
        raise WeatherServiceError(
            "Timeline duration must be between 1 and 48 hours."
        )

    start = parse_utc_datetime(start_time)
    end = start + timedelta(hours=hours)
    samples = sample_route_points(coordinates, sample_count)

    hourly_start = start.replace(
        minute=0,
        second=0,
        microsecond=0,
    )

    requested_times = [
        hourly_start + timedelta(hours=offset)
        for offset in range(hours + 1)
    ]

    if requested_times[-1] > end:
        raise WeatherServiceError(
            "The requested forecast window is invalid."
        )

    for sample in samples:
        hourly = fetch_hourly_forecast(
            sample["latitude"],
            sample["longitude"],
            session=session,
        )

        forecast_times = parse_forecast_times(hourly)
        time_lookup = {
            forecast_time: index
            for index, forecast_time in enumerate(forecast_times)
        }

        frames = []

        for forecast_time in requested_times:
            index = time_lookup.get(forecast_time)

            if index is None:
                raise WeatherServiceError(
                    "The requested corridor timeline is outside "
                    "the available forecast window."
                )

            weather = weather_at_index(hourly, index)

            frames.append({
                "forecast_time": forecast_time.isoformat(),
                "weather": weather,
                "intensity": weather_intensity(weather),
            })

        sample["frames"] = frames

    return {
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "duration_hours": hours,
        "frame_count": hours + 1,
        "sample_count": len(samples),
        "samples": samples,
        "provider": "Open-Meteo",
        "methodology": {
            "sampling": "distance_spaced_along_route_geometry",
            "forecast_interval": "hourly_utc",
            "intensity": "weather_conditions_not_freight_risk",
            "spatial_coverage": "sampled_points_not_area_wide_heatmap",
        },
    }
