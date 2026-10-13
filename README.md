
# Aether Route

Aether Route is a weather-aware route planning application built with React and Django. It helps truck drivers compare driving routes based on travel time, expected weather conditions, and the weight of the load they are carrying.

The idea behind the project is that the shortest route is not always the safest, especially when weather conditions change along the journey. Aether Route checks the weather expected at different points along each route and uses that information to help drivers make a more informed decision before setting off.

I built this project as part of a full-stack developer technical assessment for Spotter AI.

## What the application does

A driver enters their origin, destination, departure date and time, and load weight. They can also choose how frequently the application should check weather conditions along the route.

The application then:

1. Finds up to three alternative driving routes between the selected locations.
2. Calculates the estimated distance and travel time for each route.
3. Generates checkpoints at intervals of 10, 25, or 50 miles.
4. Estimates when the driver will arrive at each checkpoint.
5. Retrieves hourly weather forecasts for those locations and arrival times.
6. Evaluates wind, rainfall, and snowfall against the defined safety thresholds.
7. Calculates the estimated distance exposed to different weather risk levels.
8. Recommends a route based on weather safety first, followed by travel time.

There is also an interactive map where users can compare routes, see weather risk indicators, and explore forecast conditions over a 48-hour period.

## Technologies used

The frontend is built with React, TypeScript, Vite, and Tailwind CSS. I used MapLibre GL JS for the interactive map, React Router for navigation, Lucide for icons, and Motion for interface animations.

The backend is built with Python, Django, and Django REST Framework. It handles location lookup, route generation, checkpoint calculations, weather requests, risk assessment, and route recommendations.

The application uses three external services. OpenStreetMap Nominatim handles location lookup, OSRM provides driving routes, and Open-Meteo provides hourly weather forecasts.

These services were useful for building the project without requiring a paid routing or weather API subscription during development.

## How route planning works

### Finding alternative routes

When a user enters their origin and destination, the backend sends the locations to Nominatim to retrieve their coordinates.

Those coordinates are passed to OSRM to generate driving routes. One challenge I encountered was that OSRM did not always return three alternatives, even when alternatives were requested.

To handle this, I added a fallback that attempts to find additional routes through nearby geographic corridors. The backend also checks whether the routes are sufficiently different and filters out unreasonable detours.

The application tries to return three distinct routes, although the actual number depends on the available roads and the routing service.

### Generating checkpoints

After retrieving the routes, the backend generates checkpoints along each one.

The user can choose a spacing of 10, 25, or 50 miles. Each checkpoint has a geographic location, a distance from the beginning of the route, and an estimated arrival time.

Arrival times are calculated using the estimated total journey duration and the distance travelled along the route.

This approach gives the application a reasonable estimate of when the driver should reach each location. It does not currently account for live traffic, rest breaks, or unexpected delays.

### Getting weather forecasts

The application uses Open-Meteo to retrieve hourly weather forecasts for the checkpoint locations.

For each checkpoint, the backend selects the forecast hour closest to the estimated arrival time. This means the weather assessment is based on when the driver is expected to reach a location, rather than just the weather at the time the journey is planned.

The main measurements used are wind gust speed in miles per hour, rainfall intensity in inches per hour, and snowfall intensity in inches per hour.

Initially, the backend requested weather data separately for every checkpoint. This became less reliable when analysing three routes because a single journey could require several dozen requests.

I improved this by requesting checkpoint forecasts in batches. If a batch request fails, the backend can fall back to individual checkpoint requests.

When forecast data cannot be retrieved, the application reports that the weather analysis is unavailable instead of assuming the conditions are safe.

## Weather risk assessment

The risk assessment follows the thresholds provided in the technical assessment.

There are five possible risk levels: Low, Moderate, High, Severe, and No Travel.

Low means the weather measurements are below the warning thresholds. Moderate indicates conditions that require additional caution. High and Severe indicate increasingly dangerous conditions, while No Travel is used when a measurement exceeds the defined safety limits.

### Wind thresholds

Wind gusts below 25 mph are classified as Low risk. Gusts from 25 mph to below 35 mph are Moderate, while gusts from 35 mph to below 45 mph are High.

Wind gusts from 45 mph to below 55 mph are classified as Severe. Once wind gusts reach 55 mph or more, the risk becomes No Travel regardless of the load weight.

### Rainfall thresholds

Rainfall below 0.10 inches per hour is classified as Low risk. Rainfall from 0.10 to below 0.25 inches per hour is Moderate, while rainfall from 0.25 to below 0.50 inches per hour is High.

Rainfall from 0.50 to 1.00 inches per hour is Severe. Anything above 1.00 inches per hour is classified as No Travel.

### Snowfall thresholds

Snowfall below 0.5 inches per hour is classified as Low risk. Snowfall from 0.5 to below 1.0 inches per hour is Moderate, while snowfall from 1.0 to below 2.0 inches per hour is High.

Snowfall from 2.0 to 3.0 inches per hour is Severe. Anything above 3.0 inches per hour is classified as No Travel.

### How load weight affects risk

Load weight is particularly important when evaluating strong winds.

For any load weight, wind gusts of 55 mph or more are classified as No Travel.

If the load exceeds 30,000 lb, wind gusts from 45 mph to below 55 mph are also classified as No Travel.

If the load exceeds 40,000 lb, wind gusts from 35 mph to below 45 mph are classified as Severe instead of High.

The backend evaluates each weather measurement and assigns the checkpoint the highest applicable risk level.

These thresholds come from the assessment requirements. They are not intended to replace official weather warnings, road restrictions, or professional driving judgement.

## How the recommended route is selected

Aether Route does not automatically recommend the shortest route.

Instead, it compares the routes based on the amount of distance exposed to dangerous weather conditions.

The ranking follows this order:

1. Fewest miles classified as No Travel.
2. Fewest miles classified as Severe.
3. Fewest miles classified as High.
4. Lowest average checkpoint risk score.
5. Shortest estimated travel time.

To estimate risk mileage, the backend divides each route into segments between checkpoints. Each segment is assigned the higher risk level of its two endpoints.

This allows the application to compare routes with different distances and weather conditions using the same method.

Only routes with completed weather analyses are included in the recommendation. If the weather service fails for one of the routes, the application can still recommend an available route, but that recommendation does not represent a complete comparison of every alternative.

## Interactive map and weather timeline

The route explorer is built with MapLibre GL JS.

The map displays the available driving routes and allows users to switch between them. When a route is selected, the application shows its estimated distance, travel time, weather risk, and checkpoints.

Weather risk is represented using different colours so users can identify areas where conditions may be more dangerous.

I also added a forecast timeline that allows users to explore weather conditions along the selected route over a period of 48 hours.

The corridor forecast uses sampled locations along the route. These are displayed as numbered markers, together with a weather intensity overlay.

The timeline and route risk calculation serve different purposes. The route risk calculation considers the weather expected when the driver reaches each checkpoint. The timeline allows the user to inspect the forecast for a particular hour.

## Running the project locally

### Requirements

You will need Python 3.12 or newer, Node.js, npm, and Git installed on your computer.

An internet connection is also required because the application uses external services for routing, location lookup, and weather forecasts.

### 1. Clone the repository

```bash
git clone https://github.com/Fabulousjay/aether-route.git
cd aether-route
```

### 2. Set up the backend

Open a terminal and move into the backend directory.

```bash
cd backend
```

Create a virtual environment.

```bash
python -m venv .venv
```

If you are using Windows CMD, activate the virtual environment with:

```bat
.venv\Scripts\activate
```

Install the required Python packages.

```bash
pip install django djangorestframework django-cors-headers requests
```

Apply the database migrations.

```bash
python manage.py migrate
```

Start the Django development server.

```bash
python manage.py runserver
```

The backend should now be running at `http://127.0.0.1:8000/`.

You can confirm that the API is working by visiting `http://127.0.0.1:8000/api/health/`.

### 3. Set up the frontend

Open a second terminal and navigate to the frontend directory.

```bash
cd frontend
```

Install the frontend dependencies.

```bash
npm install
```

Start the development server.

```bash
npm run dev
```

The route planner should be available at `http://localhost:5173/studio`.

Both the frontend and backend servers must be running for the application to work locally.

## Backend API

The Django backend exposes four main endpoints.

### Health check

`GET /api/health/`

This endpoint returns a simple response confirming that the backend is running.

### Route planning

`POST /api/routes/`

This is the main endpoint used when a driver submits a journey.

An example request looks like this:

```json
{
  "origin": "Dallas, TX",
  "destination": "Houston, TX",
  "departure": "2026-10-14T12:00:00-05:00",
  "weight": 20000,
  "interval": 25
}
```

The backend responds with the available routes, their geometries, estimated distances and durations, checkpoint weather assessments, risk summaries, and a recommendation when sufficient forecast data is available.

The departure date and time must include a timezone offset.

### Weather timeline

`GET /api/weather/timeline/`

This endpoint retrieves hourly weather forecasts for a particular location.

For example:

```text
/api/weather/timeline/?latitude=32.7767&longitude=-96.7970&start_time=2026-10-14T12:00:00Z&hours=48
```

It is used to support the forecast timeline in the frontend.

### Corridor weather

`POST /api/weather/corridor/`

This endpoint retrieves weather forecasts for sampled locations along a route.

An example request looks like this:

```json
{
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [-96.797, 32.777],
      [-95.370, 29.760]
    ]
  },
  "start_time": "2026-10-14T12:00:00Z",
  "hours": 48,
  "sample_count": 7
}
```

The response contains forecast information for the sampled locations, which the frontend uses to display corridor weather conditions on the map.

## Testing

The backend includes automated tests covering the weather risk rules and route analysis logic.

To run the tests, open a terminal in the backend directory with the virtual environment activated.

```bash
python manage.py test routing
```

You can also check the Django configuration with:

```bash
python manage.py check
```

To verify that the frontend builds successfully, run the following from the frontend directory:

```bash
npm run build
```

Apart from the automated tests, I also tested the application manually by generating routes, switching between alternatives, changing checkpoint spacing, and checking how weather conditions affect the risk assessment.

## Technical decisions

### Why React and Django?

I used React because the application depends heavily on interaction. Users need to switch between routes, inspect checkpoints, and move through weather forecasts without refreshing the page.

Django handles the backend calculations and external API communication. Separating the backend logic from the frontend also makes the risk scoring easier to test.

### Why OSRM?

I chose OSRM because it provides real driving routes and estimated travel times without requiring a paid API subscription during development.

However, OSRM does not provide the truck-specific restrictions needed for a production freight navigation system. The current application focuses on comparing driving routes based on weather risk rather than providing certified truck navigation.

### Why Open-Meteo?

Open-Meteo provides the hourly weather data needed for the assessment, including wind gusts, rainfall, and snowfall.

It also allows the application to retrieve forecasts for multiple locations. This was useful when improving the backend to handle weather analysis across three routes more efficiently.

### Why rule-based risk scoring?

The assessment specifies the weather thresholds and load weight adjustments that should be used.

I implemented these as explicit rules because the results are easier to explain, verify, and test. It also means the application can show why a particular route has been classified as risky.

## Current limitations

Aether Route is a working prototype, and there are some limitations I would address before using it in a real freight operation.

The first is truck-specific routing. The current routing service does not account for vehicle height, axle weight, bridge restrictions, hazardous cargo regulations, or truck-only road rules.

Another limitation is route availability. Although the application tries to find three alternatives, some journeys may not have three reasonable routes.

Weather forecasts are also estimates and can change. The quality of the assessment depends on the data returned by the weather provider.

Checkpoint arrival times are based on estimated travel duration. The application does not currently account for live traffic, rest breaks, loading delays, or road closures.

Weather conditions are sampled at checkpoints and selected corridor locations rather than continuously along every part of the journey.

Finally, the application uses public third-party services during development. A production version would need better request caching, monitoring, and appropriate service arrangements.

If I were to continue developing the project, I would prioritise integrating a dedicated truck-routing provider, improving weather request caching, and adding more detailed vehicle and road restrictions.

## Deployment

The frontend and backend are designed to run as separate services.

For production deployment, Django needs a production application server, environment-based configuration, and appropriate security settings. The React frontend also needs to be configured to communicate with the deployed backend.

The public application URL will be added once deployment is complete.

## Author

Built by [Fabulousjay](https://github.com/Fabulousjay) as part of a full-stack developer technical assessment for Spotter AI.
