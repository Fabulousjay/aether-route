import math

import requests
from requests.exceptions import RequestException


class RoutingError(Exception):
    pass


HEADERS = {
    "User-Agent": "AetherRouteDevelopment/0.1",
    "Accept": "application/json",
}

OSRM_URL = "https://router.project-osrm.org/route/v1/driving"
MAX_ROUTES = 3
MAX_DISTANCE_FACTOR = 1.5
MAX_DURATION_FACTOR = 1.6
MAX_SHARED_CORRIDOR = 0.82
MILES_PER_METER = 1 / 1609.344


def geocode(address):
    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": address,
                "format": "json",
                "limit": 1,
            },
            headers=HEADERS,
            timeout=15,
        )
        response.raise_for_status()
        results = response.json()
    except (RequestException, ValueError) as exc:
        raise RoutingError(
            "Location lookup is temporarily unavailable."
        ) from exc

    if not isinstance(results, list) or not results:
        raise RoutingError(
            f"Could not find location: {address}"
        )

    place = results[0]

    try:
        latitude = float(place["lat"])
        longitude = float(place["lon"])

        if not (
            math.isfinite(latitude)
            and math.isfinite(longitude)
            and -90 <= latitude <= 90
            and -180 <= longitude <= 180
        ):
            raise ValueError

        return {
            "name": place["display_name"],
            "latitude": latitude,
            "longitude": longitude,
        }
    except (KeyError, TypeError, ValueError) as exc:
        raise RoutingError(
            "The location service returned invalid coordinates."
        ) from exc


def request_routes(coordinates, alternatives="false"):
    try:
        response = requests.get(
            f"{OSRM_URL}/{coordinates}",
            params={
                "alternatives": alternatives,
                "overview": "full",
                "geometries": "geojson",
                "steps": "false",
            },
            headers=HEADERS,
            timeout=25,
        )
        response.raise_for_status()
        data = response.json()
    except (RequestException, ValueError) as exc:
        raise RoutingError(
            "The routing service is temporarily unavailable."
        ) from exc

    if not isinstance(data, dict) or data.get("code") != "Ok":
        raise RoutingError(
            "No drivable route was found between these locations."
        )

    routes = data.get("routes", [])

    if not isinstance(routes, list):
        raise RoutingError(
            "The routing service returned invalid route data."
        )

    return routes


def valid_route(route):
    if not isinstance(route, dict):
        return False

    geometry = route.get("geometry")

    if not isinstance(geometry, dict):
        return False

    if geometry.get("type") != "LineString":
        return False

    points = geometry.get("coordinates")

    if not isinstance(points, list) or len(points) < 2:
        return False

    for point in points:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            return False

        try:
            longitude = float(point[0])
            latitude = float(point[1])
        except (TypeError, ValueError):
            return False

        if not (
            math.isfinite(longitude)
            and math.isfinite(latitude)
            and -180 <= longitude <= 180
            and -90 <= latitude <= 90
        ):
            return False

    try:
        distance = float(route["distance"])
        duration = float(route["duration"])
    except (KeyError, TypeError, ValueError):
        return False

    return (
        math.isfinite(distance)
        and math.isfinite(duration)
        and distance > 0
        and duration > 0
    )


def distance_miles(first, second):
    lon1, lat1 = map(math.radians, first[:2])
    lon2, lat2 = map(math.radians, second[:2])

    latitude_difference = lat2 - lat1
    longitude_difference = lon2 - lon1

    value = (
        math.sin(latitude_difference / 2) ** 2
        + math.cos(lat1)
        * math.cos(lat2)
        * math.sin(longitude_difference / 2) ** 2
    )

    return 3958.7613 * 2 * math.asin(
        min(1, math.sqrt(max(0, value)))
    )


def point_along_route(points, fraction):
    segment_lengths = [
        distance_miles(points[index - 1], points[index])
        for index in range(1, len(points))
    ]

    total = sum(segment_lengths)

    if total <= 0:
        return points[len(points) // 2][:2]

    target = total * fraction
    traveled = 0.0

    for index, length in enumerate(segment_lengths, start=1):
        if traveled + length >= target:
            portion = (
                (target - traveled) / length
                if length > 0
                else 0
            )

            first = points[index - 1]
            second = points[index]

            return [
                first[0] + (second[0] - first[0]) * portion,
                first[1] + (second[1] - first[1]) * portion,
            ]

        traveled += length

    return points[-1][:2]


def corridor_cells(route):
    points = route["geometry"]["coordinates"]
    cells = set()

    for index in range(1, len(points)):
        first = points[index - 1]
        second = points[index]

        length = distance_miles(first, second)
        steps = max(1, math.ceil(length / 2))

        for step in range(steps + 1):
            fraction = step / steps

            longitude = (
                first[0]
                + (second[0] - first[0]) * fraction
            )
            latitude = (
                first[1]
                + (second[1] - first[1]) * fraction
            )

            cells.add((
                round(longitude / 0.025),
                round(latitude / 0.025),
            ))

    return cells


def shared_corridor_fraction(first, second):
    first_cells = corridor_cells(first)
    second_cells = corridor_cells(second)

    if not first_cells or not second_cells:
        return 1.0

    shared = len(first_cells & second_cells)

    return shared / min(
        len(first_cells),
        len(second_cells),
    )


def route_is_distinct(candidate, existing_routes):
    return all(
        shared_corridor_fraction(candidate, existing)
        < MAX_SHARED_CORRIDOR
        for existing in existing_routes
    )


def route_is_reasonable(candidate, baseline):
    return (
        candidate["distance"]
        <= baseline["distance"] * MAX_DISTANCE_FACTOR
        and candidate["duration"]
        <= baseline["duration"] * MAX_DURATION_FACTOR
    )


def waypoint_candidates(start, end, baseline):
    points = baseline["geometry"]["coordinates"]

    middle = point_along_route(points, 0.5)

    latitude = math.radians(middle[1])

    east_miles = (
        (end["longitude"] - start["longitude"])
        * 69.172
        * max(0.1, abs(math.cos(latitude)))
    )
    north_miles = (
        (end["latitude"] - start["latitude"])
        * 69.0
    )

    direction_length = math.hypot(
        east_miles,
        north_miles,
    )

    if direction_length <= 0:
        return []

    perpendicular_east = -north_miles / direction_length
    perpendicular_north = east_miles / direction_length

    journey_miles = baseline["distance"] * MILES_PER_METER

    offsets = [
        max(8, min(25, journey_miles * 0.10)),
        max(15, min(45, journey_miles * 0.18)),
        max(25, min(65, journey_miles * 0.27)),
    ]

    candidates = []

    for offset in offsets:
        for side in (1, -1):
            east_offset = perpendicular_east * offset * side
            north_offset = perpendicular_north * offset * side

            longitude = (
                middle[0]
                + east_offset
                / (
                    69.172
                    * max(0.1, abs(math.cos(latitude)))
                )
            )
            candidate_latitude = (
                middle[1] + north_offset / 69.0
            )

            if (
                -180 <= longitude <= 180
                and -90 <= candidate_latitude <= 90
            ):
                candidates.append((
                    longitude,
                    candidate_latitude,
                ))

    return candidates


def discover_alternative_routes(
    start,
    end,
    baseline,
    selected_routes,
):
    start_coordinate = (
        f'{start["longitude"]},{start["latitude"]}'
    )
    end_coordinate = (
        f'{end["longitude"]},{end["latitude"]}'
    )

    for longitude, latitude in waypoint_candidates(
        start,
        end,
        baseline,
    ):
        if len(selected_routes) >= MAX_ROUTES:
            break

        coordinates = (
            f"{start_coordinate};"
            f"{longitude:.6f},{latitude:.6f};"
            f"{end_coordinate}"
        )

        try:
            candidates = request_routes(
                coordinates,
                alternatives="false",
            )
        except RoutingError:
            continue

        for candidate in candidates:
            if not valid_route(candidate):
                continue

            if not route_is_reasonable(candidate, baseline):
                continue

            if not route_is_distinct(
                candidate,
                selected_routes,
            ):
                continue

            selected_routes.append(candidate)

            if len(selected_routes) >= MAX_ROUTES:
                break

    return selected_routes


def normalize_routes(provider_routes):
    routes = []

    for provider_route in provider_routes[:MAX_ROUTES]:
        routes.append({
            "id": f"route-{len(routes) + 1}",
            "name": f"Route {len(routes) + 1}",
            "distance_miles": round(
                provider_route["distance"] * MILES_PER_METER,
                1,
            ),
            "duration_minutes": round(
                provider_route["duration"] / 60,
            ),
            "geometry": provider_route["geometry"],
        })

    return routes


def get_routes(origin, destination):
    start = geocode(origin)
    end = geocode(destination)

    coordinates = (
        f'{start["longitude"]},{start["latitude"]};'
        f'{end["longitude"]},{end["latitude"]}'
    )

    provider_routes = request_routes(
        coordinates,
        alternatives=str(MAX_ROUTES),
    )

    valid_routes = [
        route
        for route in provider_routes
        if valid_route(route)
    ]

    if not valid_routes:
        raise RoutingError(
            "No usable route geometry was returned."
        )

    baseline = min(
        valid_routes,
        key=lambda route: route["duration"],
    )

    selected_routes = [baseline]

    for candidate in sorted(
        valid_routes,
        key=lambda route: route["duration"],
    ):
        if len(selected_routes) >= MAX_ROUTES:
            break

        if (
            candidate is not baseline
            and route_is_reasonable(candidate, baseline)
            and route_is_distinct(
                candidate,
                selected_routes,
            )
        ):
            selected_routes.append(candidate)

    if len(selected_routes) < MAX_ROUTES:
        selected_routes = discover_alternative_routes(
            start,
            end,
            baseline,
            selected_routes,
        )

    routes = normalize_routes(selected_routes)

    return {
        "origin": start,
        "destination": end,
        "routes": routes,
        "route_count": len(routes),
        "provider": "OSRM development service",
        "truck_routing": False,
    }