
import re

import requests
from requests.exceptions import RequestException


NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OPEN_METEO_GEOCODING_URL = (
    "https://geocoding-api.open-meteo.com/v1/search"
)
OSRM_URL = "https://router.project-osrm.org/route/v1/driving"

HEADERS = {
    "User-Agent": "AetherRouteDevelopment/0.1",
    "Accept": "application/json",
}

US_STATE_CODES = {
    "AL": "Alabama",
    "AK": "Alaska",
    "AZ": "Arizona",
    "AR": "Arkansas",
    "CA": "California",
    "CO": "Colorado",
    "CT": "Connecticut",
    "DE": "Delaware",
    "FL": "Florida",
    "GA": "Georgia",
    "HI": "Hawaii",
    "ID": "Idaho",
    "IL": "Illinois",
    "IN": "Indiana",
    "IA": "Iowa",
    "KS": "Kansas",
    "KY": "Kentucky",
    "LA": "Louisiana",
    "ME": "Maine",
    "MD": "Maryland",
    "MA": "Massachusetts",
    "MI": "Michigan",
    "MN": "Minnesota",
    "MS": "Mississippi",
    "MO": "Missouri",
    "MT": "Montana",
    "NE": "Nebraska",
    "NV": "Nevada",
    "NH": "New Hampshire",
    "NJ": "New Jersey",
    "NM": "New Mexico",
    "NY": "New York",
    "NC": "North Carolina",
    "ND": "North Dakota",
    "OH": "Ohio",
    "OK": "Oklahoma",
    "OR": "Oregon",
    "PA": "Pennsylvania",
    "RI": "Rhode Island",
    "SC": "South Carolina",
    "SD": "South Dakota",
    "TN": "Tennessee",
    "TX": "Texas",
    "UT": "Utah",
    "VT": "Vermont",
    "VA": "Virginia",
    "WA": "Washington",
    "WV": "West Virginia",
    "WI": "Wisconsin",
    "WY": "Wyoming",
    "DC": "District of Columbia",
}


class RoutingError(Exception):
    pass


def normalize_location(value):
    return " ".join(str(value).strip().split())


def parse_location_parts(address):
    parts = [
        part.strip()
        for part in address.split(",")
        if part.strip()
    ]

    if not parts:
        raise RoutingError("Enter a valid location.")

    city = parts[0]
    qualifiers = parts[1:]

    if not qualifiers:
        match = re.fullmatch(
            r"(.+?)\s+([A-Za-z]{2})",
            city,
        )

        if match:
            possible_state = match.group(2).upper()

            if possible_state in US_STATE_CODES:
                city = match.group(1).strip()
                qualifiers = [US_STATE_CODES[possible_state]]

    normalized_qualifiers = []

    for qualifier in qualifiers:
        state = US_STATE_CODES.get(qualifier.upper())

        if state:
            normalized_qualifiers.append(state)
        else:
            normalized_qualifiers.append(qualifier)

    return city, normalized_qualifiers


def geocode_nominatim(address):
    response = requests.get(
        NOMINATIM_URL,
        params={
            "q": address,
            "format": "json",
            "limit": 1,
        },
        headers=HEADERS,
        timeout=5,
    )

    response.raise_for_status()
    results = response.json()

    if not isinstance(results, list):
        raise ValueError("Invalid geocoding response.")

    if not results:
        return None

    place = results[0]

    return {
        "name": place["display_name"],
        "latitude": float(place["lat"]),
        "longitude": float(place["lon"]),
    }


def geocode_open_meteo(address):
    city, qualifiers = parse_location_parts(address)

    response = requests.get(
        OPEN_METEO_GEOCODING_URL,
        params={
            "name": city,
            "count": 100,
            "language": "en",
            "format": "json",
        },
        headers=HEADERS,
        timeout=15,
    )

    response.raise_for_status()
    data = response.json()

    if not isinstance(data, dict):
        raise ValueError("Invalid geocoding response.")

    results = data.get("results", [])

    if not isinstance(results, list):
        raise ValueError("Invalid geocoding results.")

    if not results:
        return None

    def matches_qualifiers(place):
        searchable = [
            str(place.get("admin1", "")),
            str(place.get("admin2", "")),
            str(place.get("country", "")),
            str(place.get("country_code", "")),
        ]

        normalized = {
            value.casefold()
            for value in searchable
            if value
        }

        for qualifier in qualifiers:
            if qualifier.casefold() not in normalized:
                return False

        return True

    matches = [
        place
        for place in results
        if matches_qualifiers(place)
    ]

    if not matches:
        return None

    matches.sort(
        key=lambda place: place.get("population") or 0,
        reverse=True,
    )

    place = matches[0]

    name_parts = [
        place.get("name"),
        place.get("admin1"),
        place.get("country"),
    ]

    return {
        "name": ", ".join(
            str(part)
            for part in name_parts
            if part
        ),
        "latitude": float(place["latitude"]),
        "longitude": float(place["longitude"]),
    }


def geocode(address):
    address = normalize_location(address)

    if not address:
        raise RoutingError("Enter a valid location.")

    try:
        result = geocode_nominatim(address)

        if result is not None:
            return result
    except (RequestException, ValueError, KeyError, TypeError):
        pass

    try:
        result = geocode_open_meteo(address)

        if result is not None:
            return result
    except (RequestException, ValueError, KeyError, TypeError) as error:
        raise RoutingError(
            "Location lookup is temporarily unavailable."
        ) from error

    raise RoutingError(
        f"Could not find location: {address}. "
        "Try a city and state, such as Dallas, Texas."
    )


def get_routes(origin, destination):
    start = geocode(origin)
    end = geocode(destination)

    coordinates = (
        f'{start["longitude"]},{start["latitude"]};'
        f'{end["longitude"]},{end["latitude"]}'
    )

    try:
        response = requests.get(
            f"{OSRM_URL}/{coordinates}",
            params={
                "alternatives": "3",
                "overview": "full",
                "geometries": "geojson",
                "steps": "false",
            },
            headers=HEADERS,
            timeout=30,
        )

        response.raise_for_status()
        data = response.json()
    except (RequestException, ValueError) as error:
        raise RoutingError(
            "The routing service is temporarily unavailable."
        ) from error

    if not isinstance(data, dict) or data.get("code") != "Ok":
        raise RoutingError(
            "No drivable route was found between these locations."
        )

    routes = []

    for index, route in enumerate(data.get("routes", [])[:3]):
        geometry = route.get("geometry", {})
        route_coordinates = geometry.get("coordinates", [])

        if len(route_coordinates) < 2:
            continue

        routes.append({
            "id": f"route-{index + 1}",
            "name": f"Route {index + 1}",
            "distance_miles": round(
                route["distance"] / 1609.344,
                1,
            ),
            "duration_minutes": round(
                route["duration"] / 60
            ),
            "geometry": geometry,
        })

    if not routes:
        raise RoutingError(
            "No usable route geometry was returned."
        )

    return {
        "origin": start,
        "destination": end,
        "routes": routes,
        "route_count": len(routes),
        "provider": "OSRM development service",
        "truck_routing": False,
    }
