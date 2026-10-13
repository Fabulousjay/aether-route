from datetime import datetime
from math import isfinite

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .services.batch_weather import analyze_checkpoints_batch
from .services.checkpoints import generate_checkpoints
from .services.risk import (
    RISK_SCORES,
    score_checkpoint,
    summarize_checkpoint_risks,
)
from .services.routes import RoutingError, get_routes
from .services.weather import (
    WeatherServiceError,
    get_corridor_weather,
    get_weather_timeline,
)


MAX_WEATHER_CHECKPOINTS = 60


def weather_error_response(error):
    message = str(error)

    provider_errors = (
        "Unable to retrieve weather forecast",
        "Weather provider returned",
        "Weather forecast",
        "available forecast window",
    )

    if any(phrase in message for phrase in provider_errors):
        return Response(
            {"error": message},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return Response(
        {"error": message},
        status=status.HTTP_400_BAD_REQUEST,
    )


@api_view(["GET"])
def health(request):
    return Response({
        "status": "ok",
        "service": "Aether Route API",
    })


@api_view(["GET"])
def weather_timeline(request):
    latitude = request.query_params.get("latitude")
    longitude = request.query_params.get("longitude")
    start_time = request.query_params.get("start_time")
    hours = request.query_params.get("hours", "48")

    if latitude is None or longitude is None or not start_time:
        return Response(
            {
                "error": (
                    "Latitude, longitude and start_time are required."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        duration = int(hours)
    except (TypeError, ValueError):
        return Response(
            {"error": "Hours must be an integer between 1 and 48."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        timeline = get_weather_timeline(
            latitude=latitude,
            longitude=longitude,
            start_time=start_time,
            hours=duration,
        )
    except WeatherServiceError as error:
        return weather_error_response(error)

    return Response(timeline)


@api_view(["POST"])
def weather_corridor(request):
    geometry = request.data.get("geometry")
    start_time = request.data.get("start_time")
    hours = request.data.get("hours", 48)
    sample_count = request.data.get("sample_count", 7)

    if geometry is None or not start_time:
        return Response(
            {
                "error": (
                    "Route geometry and start_time are required."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if isinstance(hours, bool) or isinstance(sample_count, bool):
        return Response(
            {
                "error": (
                    "Hours and sample_count must be integers."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        duration = int(hours)
        count = int(sample_count)
    except (TypeError, ValueError):
        return Response(
            {
                "error": (
                    "Hours and sample_count must be integers."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        corridor = get_corridor_weather(
            geometry=geometry,
            start_time=start_time,
            hours=duration,
            sample_count=count,
        )
    except WeatherServiceError as error:
        return weather_error_response(error)

    return Response(corridor)


def unavailable_analysis(reason, checkpoint_count):
    return {
        "status": "unavailable",
        "reason": str(reason),
        "checkpoint_count": checkpoint_count,
        "checkpoints": [],
        "summary": None,
        "risk_miles": None,
    }


def analyze_route(route, departure, interval, weight):
    try:
        journey = generate_checkpoints(
            route,
            departure,
            interval,
        )
    except (ValueError, KeyError, TypeError) as error:
        return unavailable_analysis(str(error), 0)

    checkpoints = journey["checkpoints"]

    if len(checkpoints) > MAX_WEATHER_CHECKPOINTS:
        return unavailable_analysis(
            (
                "This route has too many checkpoints for the current "
                "weather request limit. Choose a larger checkpoint interval."
            ),
            len(checkpoints),
        )

    try:
        forecasts = analyze_checkpoints_batch(checkpoints)

        if len(forecasts) != len(checkpoints):
            raise WeatherServiceError(
                "Incomplete checkpoint weather analysis."
            )

        scored = [
            score_checkpoint(forecast, weight)
            for forecast in forecasts
        ]

        summary = summarize_checkpoint_risks(scored)

    except (
        WeatherServiceError,
        ValueError,
        KeyError,
        TypeError,
    ) as error:
        return unavailable_analysis(
            str(error),
            len(checkpoints),
        )

    risk_miles = {
        level: 0.0
        for level in RISK_SCORES
    }

    for index in range(len(scored) - 1):
        start = scored[index]
        end = scored[index + 1]

        distance = (
            checkpoints[index + 1]["distance_miles"]
            - checkpoints[index]["distance_miles"]
        )

        segment_level = max(
            (start["risk"]["level"], end["risk"]["level"]),
            key=lambda level: RISK_SCORES[level],
        )

        risk_miles[segment_level] += distance

    risk_miles = {
        level: round(distance, 2)
        for level, distance in risk_miles.items()
    }

    return {
        "status": "available",
        "reason": None,
        "checkpoint_count": len(scored),
        "checkpoints": scored,
        "summary": summary,
        "risk_miles": risk_miles,
        "methodology": {
            "forecast_matching": "nearest_hour",
            "arrival_estimation": "distance_proportional",
            "segment_risk": "highest_risk_of_adjacent_checkpoints",
            "risk_mileage": "estimated_from_checkpoint_segments",
        },
    }


def recommendation_key(route):
    analysis = route["weather_analysis"]
    miles = analysis["risk_miles"]
    summary = analysis["summary"]

    return (
        miles["No Travel"],
        miles["Severe"],
        miles["High"],
        summary["average_checkpoint_score"],
        route["duration_minutes"],
    )


@api_view(["POST"])
def plan_route(request):
    origin = str(request.data.get("origin", "")).strip()
    destination = str(request.data.get("destination", "")).strip()
    departure = str(request.data.get("departure", "")).strip()
    interval = str(request.data.get("interval", "25")).strip()

    if not origin or not destination:
        return Response(
            {"error": "Origin and destination are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(origin) > 200 or len(destination) > 200:
        return Response(
            {"error": "Location names must be under 200 characters."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        weight = float(request.data.get("weight", ""))
    except (ValueError, TypeError):
        return Response(
            {"error": "Enter a valid load weight."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not isfinite(weight) or weight <= 0 or weight > 200000:
        return Response(
            {
                "error": (
                    "Load weight must be greater than 0 "
                    "and at most 200,000 lb."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if interval not in {"10", "25", "50"}:
        return Response(
            {"error": "Checkpoint spacing must be 10, 25 or 50 miles."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        departure_time = datetime.fromisoformat(
            departure.replace("Z", "+00:00")
        )
    except ValueError:
        return Response(
            {"error": "Enter a valid departure date and time."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if (
        departure_time.tzinfo is None
        or departure_time.utcoffset() is None
    ):
        return Response(
            {
                "error": (
                    "Departure must include a timezone offset. "
                    "For example: 2026-10-14T08:00:00-05:00."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        result = get_routes(origin, destination)
    except RoutingError as error:
        return Response(
            {"error": str(error)},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    result["journey"] = {
        "departure": departure_time.isoformat(),
        "weight_lb": weight,
        "checkpoint_interval_miles": int(interval),
    }

    for route in result["routes"]:
        route["weather_analysis"] = analyze_route(
            route,
            departure_time,
            int(interval),
            weight,
        )

    available_routes = [
        route
        for route in result["routes"]
        if route["weather_analysis"]["status"] == "available"
    ]

    if available_routes:
        recommended = min(
            available_routes,
            key=recommendation_key,
        )

        result["recommendation"] = {
            "route_id": recommended["id"],
            "risk_level": recommended["weather_analysis"]["summary"][
                "overall_level"
            ],
            "travel_advised": not recommended[
                "weather_analysis"
            ]["summary"]["has_no_travel"],
            "reason": (
                "Ranked by fewest No Travel miles, Severe miles, "
                "High miles, average checkpoint risk, and travel time."
            ),
            "evaluated_route_count": len(available_routes),
            "all_routes_evaluated": (
                len(available_routes) == len(result["routes"])
            ),
        }
    else:
        result["recommendation"] = None

    return Response(result)