
from django.urls import path

from .views import (
    health,
    plan_route,
    weather_corridor,
    weather_timeline,
)


urlpatterns = [
    path(
        "health/",
        health,
        name="health",
    ),
    path(
        "routes/",
        plan_route,
        name="plan-route",
    ),
    path(
        "weather/timeline/",
        weather_timeline,
        name="weather-timeline",
    ),
    path(
        "weather/corridor/",
        weather_corridor,
        name="weather-corridor",
    ),
]
