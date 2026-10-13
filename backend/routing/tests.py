from django.test import SimpleTestCase

from .services.risk import (
    classify_rain,
    classify_snow,
    classify_wind,
    score_weather,
    summarize_checkpoint_risks,
)


class WindRiskTests(SimpleTestCase):
    def test_wind_thresholds(self):
        cases = [
            (0, 30000, "Low"),
            (24.9, 30000, "Low"),
            (25, 30000, "Moderate"),
            (34.9, 30000, "Moderate"),
            (35, 30000, "High"),
            (44.9, 30000, "High"),
            (45, 30000, "Severe"),
            (54.9, 30000, "Severe"),
            (55, 30000, "No Travel"),
            (70, 10000, "No Travel"),
        ]

        for wind, weight, expected in cases:
            with self.subTest(wind=wind, weight=weight):
                self.assertEqual(
                    classify_wind(wind, weight),
                    expected,
                )

    def test_load_above_30000_at_45_mph(self):
        self.assertEqual(
            classify_wind(45, 30001),
            "No Travel",
        )

    def test_load_exactly_30000_at_45_mph(self):
        self.assertEqual(
            classify_wind(45, 30000),
            "Severe",
        )

    def test_load_above_40000_at_35_mph(self):
        self.assertEqual(
            classify_wind(35, 40001),
            "Severe",
        )

    def test_load_exactly_40000_at_35_mph(self):
        self.assertEqual(
            classify_wind(35, 40000),
            "High",
        )

    def test_55_mph_restricts_every_load(self):
        for weight in (1000, 30000, 40000, 80000):
            with self.subTest(weight=weight):
                self.assertEqual(
                    classify_wind(55, weight),
                    "No Travel",
                )


class RainRiskTests(SimpleTestCase):
    def test_rain_thresholds(self):
        cases = [
            (0, "Low"),
            (0.099, "Low"),
            (0.1, "Moderate"),
            (0.249, "Moderate"),
            (0.25, "High"),
            (0.499, "High"),
            (0.5, "Severe"),
            (1.0, "Severe"),
            (1.001, "No Travel"),
        ]

        for rainfall, expected in cases:
            with self.subTest(rainfall=rainfall):
                self.assertEqual(
                    classify_rain(rainfall),
                    expected,
                )


class SnowRiskTests(SimpleTestCase):
    def test_snow_thresholds(self):
        cases = [
            (0, "Low"),
            (0.499, "Low"),
            (0.5, "Moderate"),
            (0.999, "Moderate"),
            (1.0, "High"),
            (1.999, "High"),
            (2.0, "Severe"),
            (3.0, "Severe"),
            (3.001, "No Travel"),
        ]

        for snowfall, expected in cases:
            with self.subTest(snowfall=snowfall):
                self.assertEqual(
                    classify_snow(snowfall),
                    expected,
                )


class WeatherScoringTests(SimpleTestCase):
    def test_highest_hazard_determines_overall_risk(self):
        result = score_weather(
            {
                "wind_gust_mph": 20,
                "rain_inches_per_hour": 0.3,
                "snowfall_inches_per_hour": 2.5,
            },
            30000,
        )

        self.assertEqual(result["level"], "Severe")
        self.assertEqual(result["categories"]["wind"], "Low")
        self.assertEqual(result["categories"]["rain"], "High")
        self.assertEqual(result["categories"]["snow"], "Severe")
        self.assertEqual(result["primary_hazards"], ["snow"])

    def test_multiple_hazards_can_share_highest_risk(self):
        result = score_weather(
            {
                "wind_gust_mph": 40,
                "rain_inches_per_hour": 0.3,
                "snowfall_inches_per_hour": 0,
            },
            30000,
        )

        self.assertEqual(result["level"], "High")
        self.assertEqual(
            result["primary_hazards"],
            ["wind", "rain"],
        )

    def test_no_travel_disables_travel_advice(self):
        result = score_weather(
            {
                "wind_gust_mph": 55,
                "rain_inches_per_hour": 0,
                "snowfall_inches_per_hour": 0,
            },
            10000,
        )

        self.assertEqual(result["level"], "No Travel")
        self.assertFalse(result["travel_advised"])

    def test_low_risk_allows_travel_advice(self):
        result = score_weather(
            {
                "wind_gust_mph": 10,
                "rain_inches_per_hour": 0,
                "snowfall_inches_per_hour": 0,
            },
            30000,
        )

        self.assertEqual(result["level"], "Low")
        self.assertTrue(result["travel_advised"])

    def test_missing_weather_measurement_is_rejected(self):
        with self.assertRaises(ValueError):
            score_weather(
                {
                    "wind_gust_mph": 10,
                    "rain_inches_per_hour": 0,
                },
                30000,
            )

    def test_negative_weather_measurement_is_rejected(self):
        with self.assertRaises(ValueError):
            score_weather(
                {
                    "wind_gust_mph": -5,
                    "rain_inches_per_hour": 0,
                    "snowfall_inches_per_hour": 0,
                },
                30000,
            )

    def test_invalid_weight_is_rejected(self):
        with self.assertRaises(ValueError):
            score_weather(
                {
                    "wind_gust_mph": 10,
                    "rain_inches_per_hour": 0,
                    "snowfall_inches_per_hour": 0,
                },
                0,
            )


class RiskSummaryTests(SimpleTestCase):
    def test_summary_uses_highest_checkpoint_risk(self):
        checkpoints = [
            {"risk": {"level": "Low"}},
            {"risk": {"level": "Moderate"}},
            {"risk": {"level": "Severe"}},
        ]

        summary = summarize_checkpoint_risks(checkpoints)

        self.assertEqual(summary["overall_level"], "Severe")
        self.assertEqual(summary["checkpoint_count"], 3)
        self.assertEqual(summary["counts"]["Low"], 1)
        self.assertEqual(summary["counts"]["Moderate"], 1)
        self.assertEqual(summary["counts"]["Severe"], 1)
        self.assertTrue(summary["has_severe"])
        self.assertFalse(summary["has_no_travel"])
        self.assertEqual(summary["overall_level"], "Severe")
        self.assertEqual(summary["checkpoint_count"], 3)
        self.assertEqual(summary["counts"]["Low"], 1)
        self.assertEqual(summary["counts"]["Moderate"], 1)
        self.assertEqual(summary["counts"]["Severe"], 1)
        self.assertTrue(summary["has_severe"])
        self.assertFalse(summary["has_no_travel"])
        self.assertEqual(
            summary["average_checkpoint_score"],
            1.333,
        )
     

    def test_no_travel_is_detected(self):
        checkpoints = [
            {"risk": {"level": "Low"}},
            {"risk": {"level": "No Travel"}},
        ]

        summary = summarize_checkpoint_risks(checkpoints)

        self.assertEqual(summary["overall_level"], "No Travel")
        self.assertTrue(summary["has_no_travel"])

    def test_empty_checkpoints_are_rejected(self):
        with self.assertRaises(ValueError):
            summarize_checkpoint_risks([])