from time import sleep

import requests

from .weather import (
    HOURLY_VARIABLES,
    OPEN_METEO_URL,
    WeatherServiceError,
    analyze_checkpoint_weather,
    select_forecast_hour,
)


BATCH_SIZE = 30
MAX_ATTEMPTS = 3
RETRY_STATUS_CODES = {429, 500, 502, 503, 504}


def fetch_batch_forecasts(checkpoints):
    if not checkpoints:
        return []

    latitudes = ",".join(
        str(checkpoint["latitude"])
        for checkpoint in checkpoints
    )
    longitudes = ",".join(
        str(checkpoint["longitude"])
        for checkpoint in checkpoints
    )

    params = {
        "latitude": latitudes,
        "longitude": longitudes,
        "hourly": ",".join(HOURLY_VARIABLES),
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "temperature_unit": "fahrenheit",
        "timezone": "GMT",
        "forecast_days": 16,
    }

    last_error = None

    for attempt in range(MAX_ATTEMPTS):
        try:
            response = requests.get(
                OPEN_METEO_URL,
                params=params,
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()

            if isinstance(data, dict):
                data = [data]

            if not isinstance(data, list):
                raise WeatherServiceError(
                    "Weather provider returned invalid batch data."
                )

            if len(data) != len(checkpoints):
                raise WeatherServiceError(
                    "Weather provider returned an incomplete batch."
                )

            for location in data:
                if not isinstance(location, dict):
                    raise WeatherServiceError(
                        "Weather provider returned invalid location data."
                    )

                if location.get("error"):
                    raise WeatherServiceError(
                        str(
                            location.get(
                                "reason",
                                "Weather provider returned an error.",
                            )
                        )
                    )

                hourly = location.get("hourly")

                if not isinstance(hourly, dict):
                    raise WeatherServiceError(
                        "Weather provider returned no hourly forecast."
                    )

                required = ["time", *HOURLY_VARIABLES]

                if any(
                    not isinstance(hourly.get(field), list)
                    for field in required
                ):
                    raise WeatherServiceError(
                        "Weather provider returned incomplete hourly data."
                    )

                lengths = {
                    len(hourly[field])
                    for field in required
                }

                if len(lengths) != 1 or not hourly["time"]:
                    raise WeatherServiceError(
                        "Weather provider returned inconsistent hourly data."
                    )

            return data

        except requests.HTTPError as error:
            last_error = error

            status_code = (
                error.response.status_code
                if error.response is not None
                else None
            )

            if status_code not in RETRY_STATUS_CODES:
                break

        except (
            requests.RequestException,
            ValueError,
            WeatherServiceError,
        ) as error:
            last_error = error

        if attempt < MAX_ATTEMPTS - 1:
            sleep(attempt + 1)

    raise WeatherServiceError(
        "Unable to retrieve checkpoint weather forecasts."
    ) from last_error


def checkpoint_from_hourly(checkpoint, hourly):
    forecast = select_forecast_hour(
        hourly,
        checkpoint["arrival_time"],
    )

    snowfall_cm = forecast["snowfall_cm"]

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
            "snowfall_inches_per_hour": (
                round(snowfall_cm / 2.54, 3)
                if snowfall_cm is not None
                else None
            ),
        },
        "provider": "Open-Meteo",
    }


def analyze_checkpoints_batch(checkpoints):
    results = []

    for start in range(0, len(checkpoints), BATCH_SIZE):
        group = checkpoints[start:start + BATCH_SIZE]

        try:
            forecasts = fetch_batch_forecasts(group)

            group_results = [
                checkpoint_from_hourly(checkpoint, data["hourly"])
                for checkpoint, data in zip(group, forecasts)
            ]

        except WeatherServiceError:
            group_results = []

            for checkpoint in group:
                group_results.append(
                    analyze_checkpoint_weather(checkpoint)
                )

        results.extend(group_results)

    return results