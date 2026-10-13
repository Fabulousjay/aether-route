
from datetime import datetime, timedelta, timezone
from math import asin, cos, radians, sin, sqrt


EARTH_RADIUS_MILES = 3958.7613
VALID_INTERVALS = (10, 25, 50)


def haversine_miles(start, end):
    start_lon, start_lat = start
    end_lon, end_lat = end

    lat1 = radians(start_lat)
    lat2 = radians(end_lat)

    delta_lat = radians(end_lat - start_lat)
    delta_lon = radians(end_lon - start_lon)

    value = (
        sin(delta_lat / 2) ** 2
        + cos(lat1) * cos(lat2) * sin(delta_lon / 2) ** 2
    )

    return 2 * EARTH_RADIUS_MILES * asin(min(1.0, sqrt(value)))


def parse_departure(departure):
    if isinstance(departure, datetime):
        parsed = departure
    elif isinstance(departure, str):
        parsed = datetime.fromisoformat(departure.replace("Z", "+00:00"))
    else:
        raise ValueError("Departure must be an ISO 8601 datetime.")

    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(
            "Departure must include a timezone offset, such as -05:00 or Z."
        )

    return parsed.astimezone(timezone.utc)


def prepare_geometry(geometry):
    if not isinstance(geometry, dict):
        raise ValueError("Route geometry must be a GeoJSON object.")

    if geometry.get("type") != "LineString":
        raise ValueError("Route geometry must be a GeoJSON LineString.")

    coordinates = geometry.get("coordinates")

    if not isinstance(coordinates, list) or len(coordinates) < 2:
        raise ValueError("Route geometry must contain at least two coordinates.")

    points = []

    for coordinate in coordinates:
        if not isinstance(coordinate, (list, tuple)) or len(coordinate) < 2:
            raise ValueError("Invalid route coordinate.")

        longitude = float(coordinate[0])
        latitude = float(coordinate[1])

        if not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
            raise ValueError("Route coordinates are outside valid bounds.")

        points.append((longitude, latitude))

    return points


def build_distances(points):
    cumulative = [0.0]

    for index in range(1, len(points)):
        segment_length = haversine_miles(
            points[index - 1],
            points[index],
        )

        cumulative.append(cumulative[-1] + segment_length)

    return cumulative


def interpolate_coordinate(points, cumulative, target_distance):
    if target_distance <= 0:
        return points[0]

    if target_distance >= cumulative[-1]:
        return points[-1]

    left = 0
    right = len(cumulative) - 1

    while left < right:
        middle = (left + right) // 2

        if cumulative[middle] < target_distance:
            left = middle + 1
        else:
            right = middle

    index = left

    previous_distance = cumulative[index - 1]
    next_distance = cumulative[index]
    segment_distance = next_distance - previous_distance

    if segment_distance <= 0:
        return points[index]

    fraction = (target_distance - previous_distance) / segment_distance

    start_lon, start_lat = points[index - 1]
    end_lon, end_lat = points[index]

    longitude = start_lon + (end_lon - start_lon) * fraction
    latitude = start_lat + (end_lat - start_lat) * fraction

    return longitude, latitude


def generate_checkpoints(route, departure, interval=25):
    interval = int(interval)

    if interval not in VALID_INTERVALS:
        raise ValueError("Checkpoint interval must be 10, 25, or 50 miles.")

    departure_utc = parse_departure(departure)

    distance_miles = float(route["distance_miles"])
    duration_minutes = float(route["duration_minutes"])

    if distance_miles <= 0:
        raise ValueError("Route distance must be greater than zero.")

    if duration_minutes <= 0:
        raise ValueError("Route duration must be greater than zero.")

    points = prepare_geometry(route["geometry"])
    cumulative = build_distances(points)
    geometry_distance = cumulative[-1]

    if geometry_distance <= 0:
        raise ValueError("Route geometry has no measurable length.")

    checkpoint_distances = [0.0]

    current_distance = float(interval)

    while current_distance < distance_miles:
        checkpoint_distances.append(current_distance)
        current_distance += interval

    checkpoint_distances.append(distance_miles)

    checkpoints = []

    for index, distance in enumerate(checkpoint_distances):
        progress = min(distance / distance_miles, 1.0)

        geometry_target = geometry_distance * progress

        longitude, latitude = interpolate_coordinate(
            points,
            cumulative,
            geometry_target,
        )

        elapsed_minutes = duration_minutes * progress
        arrival = departure_utc + timedelta(minutes=elapsed_minutes)

        if index == 0:
            kind = "origin"
        elif index == len(checkpoint_distances) - 1:
            kind = "destination"
        else:
            kind = "checkpoint"

        checkpoints.append(
            {
                "id": f"checkpoint-{index + 1}",
                "type": kind,
                "latitude": round(latitude, 6),
                "longitude": round(longitude, 6),
                "distance_miles": round(distance, 2),
                "remaining_miles": round(
                    max(distance_miles - distance, 0),
                    2,
                ),
                "progress_percent": round(progress * 100, 2),
                "elapsed_minutes": round(elapsed_minutes, 2),
                "arrival_time": arrival.isoformat(),
            }
        )

    return {
        "route_id": route.get("id"),
        "interval_miles": interval,
        "checkpoint_count": len(checkpoints),
        "distance_miles": round(distance_miles, 2),
        "duration_minutes": round(duration_minutes, 2),
        "departure_time": departure_utc.isoformat(),
        "arrival_time": (
            departure_utc + timedelta(minutes=duration_minutes)
        ).isoformat(),
        "timing_method": "distance_proportional",
        "checkpoints": checkpoints,
    }
