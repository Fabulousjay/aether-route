
from collections import Counter


RISK_LEVELS = (
    "Low",
    "Moderate",
    "High",
    "Severe",
    "No Travel",
)

RISK_SCORES = {
    level: index
    for index, level in enumerate(RISK_LEVELS)
}


def classify_wind(wind_gust_mph, weight_lbs):
    if wind_gust_mph >= 55:
        return "No Travel"

    if wind_gust_mph >= 45:
        if weight_lbs > 30000:
            return "No Travel"
        return "Severe"

    if wind_gust_mph >= 35:
        if weight_lbs > 40000:
            return "Severe"
        return "High"

    if wind_gust_mph >= 25:
        return "Moderate"

    return "Low"


def classify_rain(rain_inches_per_hour):
    if rain_inches_per_hour > 1.0:
        return "No Travel"

    if rain_inches_per_hour >= 0.5:
        return "Severe"

    if rain_inches_per_hour >= 0.25:
        return "High"

    if rain_inches_per_hour >= 0.1:
        return "Moderate"

    return "Low"


def classify_snow(snowfall_inches_per_hour):
    if snowfall_inches_per_hour > 3.0:
        return "No Travel"

    if snowfall_inches_per_hour >= 2.0:
        return "Severe"

    if snowfall_inches_per_hour >= 1.0:
        return "High"

    if snowfall_inches_per_hour >= 0.5:
        return "Moderate"

    return "Low"


def validate_measurement(value, name):
    if value is None:
        raise ValueError(f"Missing weather measurement: {name}.")

    try:
        measurement = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(
            f"Invalid weather measurement: {name}."
        ) from error

    if not 0 <= measurement < float("inf"):
        raise ValueError(
            f"Weather measurement must be non-negative: {name}."
        )

    return measurement


def validate_weight(weight_lbs):
    try:
        weight = float(weight_lbs)
    except (TypeError, ValueError) as error:
        raise ValueError("Truck weight must be numeric.") from error

    if not 0 < weight < float("inf"):
        raise ValueError("Truck weight must be greater than zero.")

    return weight


def score_weather(weather, weight_lbs):
    weight = validate_weight(weight_lbs)

    wind = validate_measurement(
        weather.get("wind_gust_mph"),
        "wind_gust_mph",
    )

    rain = validate_measurement(
        weather.get("rain_inches_per_hour"),
        "rain_inches_per_hour",
    )

    snow = validate_measurement(
        weather.get("snowfall_inches_per_hour"),
        "snowfall_inches_per_hour",
    )

    wind_level = classify_wind(wind, weight)
    rain_level = classify_rain(rain)
    snow_level = classify_snow(snow)

    categories = {
        "wind": wind_level,
        "rain": rain_level,
        "snow": snow_level,
    }

    overall_level = max(
        categories.values(),
        key=lambda level: RISK_SCORES[level],
    )

    highest_categories = [
        category
        for category, level in categories.items()
        if level == overall_level
    ]

    reasons = []

    if wind_level != "Low":
        reasons.append(
            f"Wind gusts of {wind:g} mph: {wind_level} risk."
        )

    if rain_level != "Low":
        reasons.append(
            f"Rainfall of {rain:g} in/hr: {rain_level} risk."
        )

    if snow_level != "Low":
        reasons.append(
            f"Snowfall of {snow:g} in/hr: {snow_level} risk."
        )

    if wind >= 45 and weight > 30000:
        reasons.append(
            "Wind restriction triggered for loads above 30,000 lb."
        )

    elif wind >= 35 and weight > 40000:
        reasons.append(
            "Wind risk escalated for loads above 40,000 lb."
        )

    if not reasons:
        reasons.append(
            "Weather measurements are below the specified risk thresholds."
        )

    return {
        "level": overall_level,
        "score": RISK_SCORES[overall_level],
        "categories": categories,
        "primary_hazards": highest_categories,
        "reasons": reasons,
        "travel_advised": overall_level != "No Travel",
        "weight_lbs": weight,
    }


def score_checkpoint(checkpoint_weather, weight_lbs):
    risk = score_weather(
        checkpoint_weather["weather"],
        weight_lbs,
    )

    return {
        **checkpoint_weather,
        "risk": risk,
    }


def summarize_checkpoint_risks(scored_checkpoints):
    if not scored_checkpoints:
        raise ValueError(
            "At least one scored checkpoint is required."
        )

    levels = [
        checkpoint["risk"]["level"]
        for checkpoint in scored_checkpoints
    ]

    counts = Counter(levels)

    highest_level = max(
        levels,
        key=lambda level: RISK_SCORES[level],
    )

    average_score = sum(
        RISK_SCORES[level]
        for level in levels
    ) / len(levels)

    return {
        "overall_level": highest_level,
        "highest_score": RISK_SCORES[highest_level],
        "average_checkpoint_score": round(average_score, 3),
        "checkpoint_count": len(scored_checkpoints),
        "counts": {
            level: counts[level]
            for level in RISK_LEVELS
        },
        "has_no_travel": counts["No Travel"] > 0,
        "has_severe": counts["Severe"] > 0,
    }
