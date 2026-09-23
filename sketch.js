// ============================================================
// NATAL CHART
// P5.JS + WORLDWIDE LOCATION + ASTROWAY / SWISS EPHEMERIS
// ============================================================


// ============================================================
// API SETTINGS
// ============================================================

// Public endpoint for testing
const USE_PUBLIC_API = true;

const ASTROWAY_API_KEY = "";

const API_URL = USE_PUBLIC_API
    ? "https://api.astroway.info/v1/public/chart"
    : "https://api.astroway.info/v1/chart";


// ============================================================
// GLOBAL VARIABLES
// ============================================================

let selectedLocation = null;

let chartData = null;

let birthInfo = null;

try {
    chartData = JSON.parse(sessionStorage.getItem("chartData")) || null;
    birthInfo = JSON.parse(sessionStorage.getItem("birthInfo")) || null;
    selectedLocation = JSON.parse(sessionStorage.getItem("selectedLocation")) || null;
} catch (error) {
    console.warn("Could not restore saved chart data.", error);
}

let chartRotation = 0;

let targetRotation = 0;


// ============================================================
// MAIN PLANETS
// ============================================================

const MAIN_PLANETS = [

    "Sun",
    "Moon",
    "Mercury",
    "Venus",
    "Mars",
    "Jupiter",
    "Saturn",
    "Uranus",
    "Neptune",
    "Pluto"

];


// ============================================================
// ZODIAC
// ============================================================

const zodiacSigns = [

    "Aries",
    "Taurus",
    "Gemini",
    "Cancer",
    "Leo",
    "Virgo",
    "Libra",
    "Scorpio",
    "Sagittarius",
    "Capricorn",
    "Aquarius",
    "Pisces"

];


const zodiacSymbols = [

    "♈",
    "♉",
    "♊",
    "♋",
    "♌",
    "♍",
    "♎",
    "♏",
    "♐",
    "♑",
    "♒",
    "♓"

];


// ============================================================
// PLANET SYMBOLS
// ============================================================

const planetSymbols = {

    sun: "☉",

    moon: "☽",

    mercury: "☿",

    venus: "♀",

    mars: "♂",

    jupiter: "♃",

    saturn: "♄",

    uranus: "♅",

    neptune: "♆",

    pluto: "♇"

};


// ============================================================
// DOM ELEMENTS
// ============================================================

const birthDate =
    document.getElementById(
        "birthDate"
    );


const birthTime =
    document.getElementById(
        "birthTime"
    );


const placeInput =
    document.getElementById(
        "birthPlace"
    );


const locationResults =
    document.getElementById(
        "locationResults"
    );


const selectedLocationText =
    document.getElementById(
        "selectedLocation"
    );


const generateBtn =
    document.getElementById(
        "generateBtn"
    );


const statusText =
    document.getElementById(
        "status"
    );


// ============================================================
// LOCATION SEARCH
// ============================================================

let searchTimeout;


placeInput?.addEventListener(
    "input",
    function () {

        clearTimeout(
            searchTimeout
        );


        selectedLocation = null;


        selectedLocationText.textContent =
            "No location selected";


        generateBtn.disabled =
            true;


        const query =
            placeInput.value.trim();


        if (query.length < 2) {

            locationResults.classList.remove(
                "show"
            );

            return;

        }


        searchTimeout =
            setTimeout(
                function () {

                    searchLocations(
                        query
                    );

                },
                400
            );

    }
);


// ============================================================
// WORLDWIDE LOCATION SEARCH
// ============================================================

async function searchLocations(
    query
) {

    locationResults.innerHTML =
        `
        <div class="location-option">
            Searching...
        </div>
        `;


    locationResults.classList.add(
        "show"
    );


    try {

        const url =
            "https://geocoding-api.open-meteo.com/v1/search"
            +
            "?name="
            +
            encodeURIComponent(
                query
            )
            +
            "&count=8"
            +
            "&language=en"
            +
            "&format=json";


        const response =
            await fetch(
                url
            );


        if (!response.ok) {

            throw new Error(
                "Location search failed."
            );

        }


        const data =
            await response.json();


        showLocationResults(
            data.results || []
        );

    }

    catch (error) {

        console.error(
            "LOCATION ERROR:",
            error
        );


        locationResults.innerHTML =
            `
            <div class="location-option">
                Location search failed.
            </div>
            `;

    }

}


// ============================================================
// DISPLAY LOCATION RESULTS
// ============================================================

function showLocationResults(
    results
) {

    locationResults.innerHTML = "";


    if (
        results.length === 0
    ) {

        locationResults.innerHTML =
            `
            <div class="location-option">
                No locations found.
            </div>
            `;

        locationResults.classList.add(
            "show"
        );

        return;

    }


    results.forEach(
        function (
            location
        ) {

            const option =
                document.createElement(
                    "button"
                );


            option.type =
                "button";


            option.className =
                "location-option";


            let locationText =
                location.name;


            if (
                location.admin1
            ) {

                locationText +=
                    `, ${location.admin1}`;

            }


            if (
                location.country
            ) {

                locationText +=
                    `, ${location.country}`;

            }


            option.textContent =
                locationText;


            option.addEventListener(
                "click",
                function () {

                    selectLocation(
                        location
                    );

                }
            );


            locationResults.appendChild(
                option
            );

        }
    );


    locationResults.classList.add(
        "show"
    );

}


// ============================================================
// SELECT LOCATION
// ============================================================

function selectLocation(
    location
) {

    selectedLocation = {

        name:
            location.name,

        country:
            location.country,

        admin1:
            location.admin1 || "",

        latitude:
            Number(
                location.latitude
            ),

        longitude:
            Number(
                location.longitude
            ),

        timezone:
            location.timezone

    };


    placeInput.value =
        location.name;


    selectedLocationText.textContent =
        `${location.name}, ${location.country} · ${location.timezone}`;


    locationResults.classList.remove(
        "show"
    );


    checkForm();


    console.log(
        "SELECTED LOCATION:",
        selectedLocation
    );

}


// ============================================================
// CHECK FORM
// ============================================================

function checkForm() {

    generateBtn.disabled =
        !(
            birthDate.value &&
            birthTime.value &&
            selectedLocation
        );

}


birthDate?.addEventListener(
    "change",
    checkForm
);


birthTime?.addEventListener(
    "change",
    checkForm
);


// ============================================================
// GENERATE CHART
// ============================================================

generateBtn?.addEventListener(
    "click",
    generateChart
);


async function generateChart() {

    if (
        !birthDate.value ||
        !birthTime.value ||
        !selectedLocation
    ) {

        return;

    }


    setStatus(
        "Calculating your natal chart..."
    );


    if (
        typeof window.onChartGenerateStart ===
        "function"
    ) {

        window.onChartGenerateStart();

    }


    generateBtn.disabled =
        true;


    try {

        // ----------------------------------------------------
        // TIMEZONE
        // ----------------------------------------------------

        const timezoneOffset =
            getTimezoneOffset(
                birthDate.value,
                birthTime.value,
                selectedLocation.timezone
            );


        // ----------------------------------------------------
        // API REQUEST
        // ----------------------------------------------------

        const requestBody = {

            date:
                birthDate.value,

            time:
                birthTime.value + ":00",

            timezoneOffset:
                timezoneOffset,

            latitude:
                selectedLocation.latitude,

            longitude:
                selectedLocation.longitude,

            houseSystem:
                "P"

        };


        console.log(
            "=============================="
        );


        console.log(
            "NATAL CHART REQUEST"
        );


        console.log(
            requestBody
        );


        console.log(
            "Timezone offset:",
            timezoneOffset
        );


        console.log(
            "=============================="
        );


        // ----------------------------------------------------
        // HEADERS
        // ----------------------------------------------------

        const headers = {

            "Content-Type":
                "application/json"

        };


        if (
            !USE_PUBLIC_API
        ) {

            headers[
                "X-Api-Key"
            ] =
                ASTROWAY_API_KEY;

        }


        // ----------------------------------------------------
        // FETCH
        // ----------------------------------------------------

        const response =
            await fetch(
                API_URL,
                {

                    method:
                        "POST",

                    headers:
                        headers,

                    body:
                        JSON.stringify(
                            requestBody
                        )

                }
            );


        // ----------------------------------------------------
        // ERROR
        // ----------------------------------------------------

        if (
            !response.ok
        ) {

            const errorText =
                await response.text();


            console.error(
                "ASTROWAY ERROR:",
                errorText
            );


            throw new Error(
                `API error: ${response.status}`
            );

        }


        // ----------------------------------------------------
        // JSON
        // ----------------------------------------------------

        const data =
            await response.json();


        console.log(
            "RAW API RESPONSE:",
            data
        );


        // ----------------------------------------------------
        // PROCESS DATA
        // ----------------------------------------------------

        chartData =
            normaliseChartData(
                data
            );


        console.log(
            "FINAL CHART DATA:",
            chartData
        );


        birthInfo = {
            date: birthDate.value,
            time: birthTime.value,
            place: `${selectedLocation.name}, ${selectedLocation.country}`
        };

        sessionStorage.setItem("chartData", JSON.stringify(chartData));
        sessionStorage.setItem("birthInfo", JSON.stringify(birthInfo));
        sessionStorage.setItem("selectedLocation", JSON.stringify(selectedLocation));

        if (typeof window.onChartReady === "function") {
            window.onChartReady();
            return;
        } else if (document.getElementById("result")) {
            displayResults();
        } else {
            window.location.href = "display.html";
            return;
        }


        // ----------------------------------------------------
        // GENERATIVE VISUAL
        // ----------------------------------------------------

        targetRotation =
            random(
                -10,
                10
            );


        setStatus(
            "Your natal chart has been generated."
        );


        document
            .getElementById(
                "result"
            )
            .scrollIntoView({
                behavior: "smooth"
            });

    }

    catch (error) {

        console.error(
            "CHART ERROR:",
            error
        );


        setStatus(
            "Could not generate your chart. Open F12 → Console to see the error."
        );


        if (
            typeof window.onChartGenerateError ===
            "function"
        ) {

            window.onChartGenerateError(
                error
            );

        }

    }


    finally {

        checkForm();

    }

}


// ============================================================
// TIMEZONE OFFSET
// ============================================================

function getTimezoneOffset(
    dateString,
    timeString,
    timezone
) {

    const date =
        new Date(
            `${dateString}T${timeString}:00Z`
        );


    const parts =
        new Intl.DateTimeFormat(
            "en-US",
            {

                timeZone:
                    timezone,

                year:
                    "numeric",

                month:
                    "2-digit",

                day:
                    "2-digit",

                hour:
                    "2-digit",

                minute:
                    "2-digit",

                second:
                    "2-digit",

                hourCycle:
                    "h23"

            }
        )
        .formatToParts(
            date
        );


    const values = {};


    parts.forEach(
        function (
            part
        ) {

            if (
                part.type !==
                "literal"
            ) {

                values[
                    part.type
                ] =
                    part.value;

            }

        }
    );


    const localAsUTC =
        Date.UTC(

            Number(
                values.year
            ),

            Number(
                values.month
            ) - 1,

            Number(
                values.day
            ),

            Number(
                values.hour
            ),

            Number(
                values.minute
            ),

            Number(
                values.second
            )

        );


    const utcTime =
        date.getTime();


    const offset =
        (
            localAsUTC -
            utcTime
        )
        /
        (
            1000 * 60 * 60
        );


    return offset;

}


// ============================================================
// NORMALISE API RESPONSE
// ============================================================

function normaliseChartData(
    response
) {

    const data =
        response.data ||
        response;


    // --------------------------------------------------------
    // PLANETS
    // --------------------------------------------------------

    const planets =
        extractMainPlanets(
            data
        );


    // --------------------------------------------------------
    // ASCENDANT
    // --------------------------------------------------------
    //
    // IMPORTANT:
    //
    // AstroWay stores the Ascendant inside:
    //
    // data.houses.ascendant
    //
    // --------------------------------------------------------

    const ascendant =
        Number(
            data.houses?.ascendant
        );


    console.log(
        "ASCENDANT:",
        ascendant
    );


    if (
        Number.isNaN(
            ascendant
        )
    ) {

        throw new Error(
            "Ascendant was not found in API response."
        );

    }


    return {

        planets:

            planets,

        ascendant:

            ascendant

    };

}


// ============================================================
// EXTRACT ONLY MAIN PLANETS
// ============================================================

function extractMainPlanets(
    data
) {

    let rawPlanets =
        data.planets ||
        data.positions ||
        [];


    // Some APIs return an object.
    // Convert it into an array.

    if (
        !Array.isArray(
            rawPlanets
        )
    ) {

        rawPlanets =
            Object.entries(
                rawPlanets
            )
            .map(
                function (
                    [
                        key,
                        value
                    ]
                ) {

                    return {

                        name:
                            key,

                        ...value

                    };

                }
            );

    }


    const planets = [];


    rawPlanets.forEach(
        function (
            planet
        ) {

            const name =
                formatPlanetName(
                    planet.name
                );


            // ------------------------------------------------
            // ONLY KEEP THE 10 MAIN PLANETS
            // ------------------------------------------------

            if (
                !MAIN_PLANETS.includes(
                    name
                )
            ) {

                return;

            }


            const longitude =
                Number(
                    planet.fullDegree ??
                    planet.longitude ??
                    planet.degree ??
                    0
                );


            const degree =
                Number(
                    planet.degreeInSign ??
                    getDegreeInSign(
                        longitude
                    )
                );


            planets.push({

                name:
                    name,

                longitude:
                    longitude,

                sign:
                    planet.sign ||
                    getZodiac(
                        longitude
                    ),

                degree:
                    degree,

                symbol:
                    getPlanetSymbol(
                        name
                    )

            });

        }
    );


    // Keep the planets in our preferred order.

    planets.sort(
        function (
            a,
            b
        ) {

            return (
                MAIN_PLANETS.indexOf(
                    a.name
                )
                -
                MAIN_PLANETS.indexOf(
                    b.name
                )
            );

        }
    );


    return planets;

}


// ============================================================
// FORMAT PLANET NAME
// ============================================================

function formatPlanetName(
    name
) {

    if (!name) {

        return "";

    }


    const cleanName =
        String(
            name
        )
        .trim()
        .toLowerCase();


    return (
        cleanName
            .charAt(0)
            .toUpperCase()
        +
        cleanName.slice(1)
    );

}


// ============================================================
// PLANET SYMBOL
// ============================================================

function getPlanetSymbol(
    name
) {

    return (
        planetSymbols[
            String(
                name
            )
            .toLowerCase()
        ]
        ||
        "●"
    );

}


// ============================================================
// GET ZODIAC SIGN
// ============================================================

function getZodiac(
    longitude
) {

    const normalised =
        normalizeAngle(
            longitude
        );


    const index =
        Math.floor(
            normalised / 30
        );


    return zodiacSigns[
        index
    ];

}


// ============================================================
// GET DEGREE INSIDE SIGN
// ============================================================

function getDegreeInSign(
    longitude
) {

    return (
        normalizeAngle(
            longitude
        )
        %
        30
    );

}


// ============================================================
// NORMALISE ANGLE
// ============================================================

function normalizeAngle(
    angle
) {

    return (
        (
            angle % 360
        )
        +
        360
    ) % 360;

}


// ============================================================
// DISPLAY RESULTS
// ============================================================

function displayResults() {

    const result =
        document.getElementById(
            "result"
        );


    if (result) {
        result.classList.remove(
            "hidden"
        );
    }


    // ========================================================
    // SUN
    // ========================================================

    const sun =
        findPlanet(
            "Sun"
        );


    if (sun) {

        document
            .getElementById(
                "sunSign"
            )
            .textContent =
            sun.sign;


        document
            .getElementById(
                "sunDegree"
            )
            .textContent =
            formatDegree(
                sun.degree
            );

    }


    // ========================================================
    // MOON
    // ========================================================

    const moon =
        findPlanet(
            "Moon"
        );


    if (moon) {

        document
            .getElementById(
                "moonSign"
            )
            .textContent =
            moon.sign;


        document
            .getElementById(
                "moonDegree"
            )
            .textContent =
            formatDegree(
                moon.degree
            );

    }


    // ========================================================
    // RISING
    // ========================================================

    const risingLongitude =
        chartData.ascendant;


    const risingSign =
        getZodiac(
            risingLongitude
        );


    const risingDegree =
        getDegreeInSign(
            risingLongitude
        );


    const risingSignElement = document.getElementById("risingSign");
    const risingDegreeElement = document.getElementById("risingDegree");

    if (risingSignElement && risingDegreeElement) {
        risingSignElement.textContent = risingSign;
        risingDegreeElement.textContent = formatDegree(risingDegree);
    }


    // ========================================================
    // BIRTH SUMMARY
    // ========================================================

    document
        .getElementById(
            "birthSummary"
        )
        .textContent = birthInfo
        ? `${birthInfo.date} · ${birthInfo.time} · ${birthInfo.place}`
        : "";


    // ========================================================
    // PLANET LIST
    // ========================================================

    const planetList =
        document.getElementById(
            "planetList"
        );


    planetList.innerHTML =
        "";


    chartData.planets.forEach(
        function (
            planet
        ) {

            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "planet-row";


            row.innerHTML = `

                <div class="planet-row-left">

                    <span class="planet-row-symbol">
                        ${planet.symbol}
                    </span>

                    <span class="planet-row-name">
                        ${planet.name}
                    </span>

                </div>

                <span class="planet-row-position">

                    ${planet.sign}

                    ${formatDegree(
                        planet.degree
                    )}

                </span>

            `;


            planetList.appendChild(
                row
            );

        }
    );

}

if (document.getElementById("sunSign") && chartData) {
    displayResults();
}


// ============================================================
// FIND PLANET
// ============================================================

function findPlanet(
    name
) {

    return chartData.planets.find(
        function (
            planet
        ) {

            return (
                planet.name ===
                name
            );

        }
    );

}


// ============================================================
// FORMAT DEGREE
// ============================================================

function formatDegree(
    degree
) {

    return (
        Number(
            degree
        )
        .toFixed(2)
        +
        "°"
    );

}


// ============================================================
// STATUS
// ============================================================

function setStatus(
    message
) {

    if (statusText) {
        statusText.textContent =
            message;
    }

}


// ============================================================
// P5.JS
// ============================================================

const IS_LANDING =
    document.body?.classList.contains("landing-page") ?? false;


const HAS_CHART_CANVAS =
    !IS_LANDING && !!document.getElementById("canvas-container");


function setup() {

    if (IS_LANDING) {
        constellation.setup();
        return;
    }

    if (!HAS_CHART_CANVAS) {
        noLoop();
        return;
    }


    const canvas =
        createCanvas(
            min(
                windowWidth,
                700
            ),
            600
        );


    canvas.parent(
        "canvas-container"
    );


    angleMode(
        DEGREES
    );


    noFill();

    strokeWeight(
        1
    );

}


// ============================================================
// DRAW
// ============================================================

function draw() {

    if (IS_LANDING) {
        constellation.draw();
        return;
    }

    if (!HAS_CHART_CANVAS) {
        return;
    }


    clear();


    if (
        !chartData
    ) {

        drawIntroChart();

        return;

    }


    chartRotation =
        lerp(
            chartRotation,
            targetRotation,
            0.05
        );


    drawNatalChart();

}


// ============================================================
// BEFORE CHART
// ============================================================

function drawIntroChart() {

    push();


    translate(
        width / 2,
        height / 2
    );


    const radius =
        min(
            width,
            height
        ) * .3;


    stroke(
        20,
        20,
        20,
        80
    );


    for (
        let i = 0;
        i < 4;
        i++
    ) {

        ellipse(
            0,
            0,
            radius + i * 50,
            radius + i * 50
        );

    }


    const movingAngle =
        frameCount * .4;


    const x =
        cos(
            movingAngle
        )
        *
        radius;


    const y =
        sin(
            movingAngle
        )
        *
        radius;


    fill(20);

    noStroke();


    ellipse(
        x,
        y,
        10,
        10
    );


    pop();

}


// ============================================================
// DRAW NATAL CHART
// ============================================================

function drawNatalChart() {

    push();


    translate(
        width / 2,
        height / 2
    );


    rotate(
        chartRotation
    );


    const radius =
        min(
            width,
            height
        ) * .35;


    // ========================================================
    // OUTER CIRCLE
    // ========================================================

    noFill();

    stroke(
        20,
        20,
        20,
        120
    );


    ellipse(
        0,
        0,
        radius * 2,
        radius * 2
    );


    // ========================================================
    // INNER CIRCLE
    // ========================================================

    ellipse(
        0,
        0,
        radius * 1.5,
        radius * 1.5
    );


    // ========================================================
    // ZODIAC
    // ========================================================

    for (
        let i = 0;
        i < 12;
        i++
    ) {

        const angle =
            i * 30;


        const x1 =
            cos(angle) *
            radius;


        const y1 =
            sin(angle) *
            radius;


        const x2 =
            cos(angle) *
            radius *
            .75;


        const y2 =
            sin(angle) *
            radius *
            .75;


        line(
            x1,
            y1,
            x2,
            y2
        );


        // Zodiac symbol

        const symbolRadius =
            radius * .88;


        const sx =
            cos(
                angle + 15
            )
            *
            symbolRadius;


        const sy =
            sin(
                angle + 15
            )
            *
            symbolRadius;


        fill(20);

        noStroke();

        textAlign(
            CENTER,
            CENTER
        );


        textSize(
            18
        );


        text(
            zodiacSymbols[i],
            sx,
            sy
        );

    }


    // ========================================================
    // PLANETS
    // ========================================================

    chartData.planets.forEach(
        function (
            planet,
            index
        ) {

            drawPlanet(
                planet,
                radius,
                index
            );

        }
    );


    // ========================================================
    // ASCENDANT
    // ========================================================

    drawAscendant(
        chartData.ascendant,
        radius
    );


    pop();

}


// ============================================================
// DRAW PLANET
// ============================================================

function drawPlanet(
    planet,
    radius,
    index
) {

    // Convert astronomical longitude
    // into our circular visual angle.

    const angle =
        planet.longitude - 90;


    // Spread planets through the visual.

    const distance =
        radius *
        (
            .30 +
            index * .055
        );


    const x =
        cos(angle) *
        distance;


    const y =
        sin(angle) *
        distance;


    // Connection line

    stroke(
        20,
        20,
        20,
        50
    );


    line(
        0,
        0,
        x,
        y
    );


    // Planet point

    fill(20);

    noStroke();


    ellipse(
        x,
        y,
        14,
        14
    );


    // Planet symbol

    fill(20);


    textAlign(
        CENTER,
        CENTER
    );


    textSize(
        16
    );


    text(
        planet.symbol,
        x,
        y - 20
    );

}


// ============================================================
// DRAW ASCENDANT
// ============================================================

function drawAscendant(
    longitude,
    radius
) {

    const angle =
        longitude - 90;


    const x =
        cos(angle) *
        radius;


    const y =
        sin(angle) *
        radius;


    // Rising line

    stroke(
        20,
        20,
        20,
        180
    );


    strokeWeight(
        2
    );


    line(
        0,
        0,
        x,
        y
    );


    // Rising point

    fill(20);

    noStroke();


    ellipse(
        x,
        y,
        18,
        18
    );


    // Reset stroke weight

    strokeWeight(
        1
    );

}


// ============================================================
// RESIZE
// ============================================================

function windowResized() {

    if (IS_LANDING) {
        resizeCanvas(windowWidth, windowHeight);
        return;
    }


    resizeCanvas(
        min(
            windowWidth,
            700
        ),
        600
    );

}


// ============================================================
// MOUSE
// ============================================================

function mousePressed(event) {

    if (IS_LANDING) {
        constellation.pressed(event);
    }

}


// ============================================================
// LANDING PAGE: CONSTELLATION GENERATOR
// Every click on the landing page (landing.html) draws a brand new,
// randomly shaped star-chart constellation centred on the cursor:
//   - 8-15 dots, mostly small with a few brighter ones
//   - joined by thin solid lines into a chain / branching shape,
//     sometimes closed into a small loop
//   - drawn in star by star, floats slowly, then fades away
//
// landing.html loads this same file. setup(), draw(), windowResized()
// and mousePressed() above hand over to this section when the page
// has <body class="landing-page">; every other page ignores it.
// The canvas ignores the mouse (see .constellation-canvas in the
// CSS), so clicks are read from the window by mousePressed().
// ============================================================

const constellation = IS_LANDING ? (() => {

    // Touch devices use a tap to continue (see js/landing.js), so no canvas there
    const touchOnly = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---- tweak these -------------------------------------------------
    const LIFE          = 16000;   // ms a constellation stays before it starts to fade
    const FADE          = 5000;    // ms it takes to fade out
    const MAX_ON_SCREEN = 5;       // oldest ones fade early beyond this
    const MIN_STARS     = 8;       // stars per constellation (random between these)
    const MAX_STARS     = 15;
    const DRAW_MS       = 140;     // ms for a line to draw between two stars
    const DOT_MIN       = 1.6;     // radius (px) of the ordinary stars
    const DOT_MAX       = 3.4;
    const BIG_MIN       = 3;     // radius (px) of the 2-3 bright stars
    const BIG_MAX       = 4.5;
    const LINE_WEIGHT   = 0.5;       // line thickness (px)
    const LINE_ALPHA    = 0.5;     // line opacity, 0-1
    const STAR_ALPHA    = 0.5;     // star opacity, 0-1
    const DRIFT_SPEED   = [2, 6];  // px per second the whole shape floats (random in this range)
    const SWAY          = [1.5, 4];// px each star bobs around on its own (0 = rigid shape)
    const MIN_GAP       = 34;      // closest two stars can be (px, at 900px screen height)
    const MAX_RADIUS    = 300;     // furthest a star can be from the centre (px, same scale)
    // ------------------------------------------------------------------

    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
    const clamp01      = t => Math.max(0, Math.min(1, t));

    // "personalities" so the shapes differ from click to click
    const STYLES = [
        { name: "chain",   branch: 0.12, turn: 0.95, step: [70, 140] },   // long meandering line
        { name: "branchy", branch: 0.45, turn: 1.40, step: [55, 120] },   // tree with several arms
        { name: "cluster", branch: 0.30, turn: 1.90, step: [40, 95]  }    // tighter, more loops
    ];

    let sets = [];


    // ---------------------------------------------------------
    // Geometry helpers
    // ---------------------------------------------------------
    function ccw(a, b, c) {
        return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
    }

    function segmentsCross(a, b, c, d) {
        return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
    }

    function pointToSegment(p, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy || 1;
        const t = clamp01(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2);
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }

    // ---------------------------------------------------------
    // Build one random constellation centred on (cx, cy)
    // ---------------------------------------------------------
    function generate(cx, cy, now) {

        const S = Math.min(width, height) / 900;        // scale with the screen
        const style = STYLES[Math.floor(random(STYLES.length))];
        const target = Math.floor(random(MIN_STARS, MAX_STARS + 1));

        const nodes = [{ x: 0, y: 0, parent: -1, dir: random(TWO_PI), depth: 0 }];
        const edges = [];                               // { a, b } as node indices

        // grow outwards from the first star, one star at a time
        for (let tries = 0; nodes.length < target && tries < 600; tries++) {

            const pi = Math.random() < style.branch
                ? Math.floor(random(nodes.length))      // branch off any star
                : nodes.length - 1;                     // or carry on from the last one
            const parent = nodes[pi];

            const dir = parent.dir + random(-style.turn, style.turn);
            const step = random(style.step[0], style.step[1]) * S;
            const p = { x: parent.x + Math.cos(dir) * step, y: parent.y + Math.sin(dir) * step };

            if (Math.hypot(p.x, p.y) > MAX_RADIUS * S) continue;
            if (nodes.some(n => Math.hypot(n.x - p.x, n.y - p.y) < MIN_GAP * S)) continue;
            if (edges.some(e => pointToSegment(p, nodes[e.a], nodes[e.b]) < MIN_GAP * S * 0.55)) continue;
            if (edges.some(e => e.a !== pi && e.b !== pi &&
                segmentsCross(parent, p, nodes[e.a], nodes[e.b]))) continue;

            nodes.push({ x: p.x, y: p.y, parent: pi, dir, depth: parent.depth + 1 });
            edges.push({ a: pi, b: nodes.length - 1 });

        }

        // close up to two small loops between stars that are near each other
        const loops = Math.floor(random(0, 3));
        const pairs = [];
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
                const linked = edges.some(e => (e.a === i && e.b === j) || (e.a === j && e.b === i));
                if (!linked && d < 150 * S) pairs.push({ i, j, d });
            }
        }
        pairs.sort((p, q) => p.d - q.d);

        let added = 0;
        for (let k = 0; k < pairs.length && added < loops; k++) {

            const { i, j } = pairs[Math.floor(random(Math.min(pairs.length, 6)))];
            const linked = edges.some(e => (e.a === i && e.b === j) || (e.a === j && e.b === i));
            if (linked) continue;

            const clear = !edges.some(e => e.a !== i && e.a !== j && e.b !== i && e.b !== j &&
                segmentsCross(nodes[i], nodes[j], nodes[e.a], nodes[e.b]));
            const clearOfDots = !nodes.some((n, idx) => idx !== i && idx !== j &&
                pointToSegment(n, nodes[i], nodes[j]) < MIN_GAP * S * 0.5);

            if (clear && clearOfDots) {
                edges.push({ a: i, b: j, loop: true });
                added++;
            }

        }

        // centre the shape on the click, then keep it fully on screen
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        nodes.forEach(n => {
            minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
            minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
        });

        const halfW = (maxX - minX) / 2;
        const halfH = (maxY - minY) / 2;
        const margin = 40;

        let ox = cx;
        let oy = cy;
        if (halfW * 2 + margin * 2 < width)  ox = Math.max(margin + halfW, Math.min(width  - margin - halfW, ox));
        if (halfH * 2 + margin * 2 < height) oy = Math.max(margin + halfH, Math.min(height - margin - halfH, oy));

        const shiftX = ox - (minX + maxX) / 2;
        const shiftY = oy - (minY + maxY) / 2;

        // stars: mostly small dots, a few bigger bright ones
        const stars = nodes.map(n => ({
            x: n.x + shiftX,
            y: n.y + shiftY,
            r: random(DOT_MIN, DOT_MAX),
            appear: 0,
            amp: random(SWAY[0], SWAY[1]),
            fx: random(0.0004, 0.0009),            // sway speed (rad per ms)
            fy: random(0.0004, 0.0009),
            p1: random(TWO_PI),
            p2: random(TWO_PI)
        }));

        const bigCount = Math.min(stars.length, Math.floor(random(2, 4)));
        const order = stars.map((_, i) => i).sort(() => Math.random() - 0.5);
        for (let k = 0; k < bigCount; k++) stars[order[k]].r = random(BIG_MIN, BIG_MAX);

        // timing: the shape draws itself outwards from the first star
        nodes.forEach((n, i) => {
            if (n.parent < 0) return;
            const start = stars[n.parent].appear;
            edges.find(e => e.b === i && !e.loop).start = start;
            stars[i].appear = start + DRAW_MS * random(0.9, 1.4);
        });
        edges.forEach(e => {
            if (e.loop) e.start = Math.max(stars[e.a].appear, stars[e.b].appear) + 120;
        });

        // the whole shape drifts slowly in a random direction until it is gone
        const heading = random(TWO_PI);
        const speed = random(DRIFT_SPEED[0], DRIFT_SPEED[1]) / 1000;     // px per ms

        return {
            born: now,
            stars,
            edges: edges.map(e => ({ a: e.a, b: e.b, start: e.start })),
            vx: Math.cos(heading) * speed,
            vy: Math.sin(heading) * speed,
            fadeAt: LIFE - FADE,
            fadeLen: FADE
        };

    }

    // ---------------------------------------------------------
    // Drawing
    // ---------------------------------------------------------
    function draw() {

        const now = millis();

        clear();

        sets = sets.filter(c => now - c.born < c.fadeAt + c.fadeLen);

        if (!sets.length) {
            noLoop();
            return;
        }

        sets.forEach(c => drawSet(c, now));

    }

    function drawSet(c, now) {

        const ctx = drawingContext;
        const age = now - c.born;
        const fade = 1 - clamp01((age - c.fadeAt) / c.fadeLen);

        // where every star is right now: its spot + the shared drift + its own sway
        const pos = c.stars.map(s => reduceMotion
            ? { x: s.x, y: s.y }
            : {
                x: s.x + c.vx * age + Math.sin(age * s.fx + s.p1) * s.amp,
                y: s.y + c.vy * age + Math.sin(age * s.fy + s.p2) * s.amp
            });

        // solid lines, drawing themselves from one star to the next
        noFill();
        strokeWeight(LINE_WEIGHT);
        stroke(255, 255 * LINE_ALPHA * fade);

        c.edges.forEach(e => {

            const grow = reduceMotion ? 1 : clamp01((age - e.start) / DRAW_MS);
            if (grow <= 0) return;

            const a = pos[e.a];
            const b = pos[e.b];

            line(a.x, a.y, lerp(a.x, b.x, grow), lerp(a.y, b.y, grow));

        });

        // stars
        noStroke();

        c.stars.forEach((s, i) => {

            const t = reduceMotion ? 1 : clamp01((age - s.appear) / 280);
            if (t <= 0) return;

            const k = easeOutCubic(t);

            ctx.shadowColor = "rgba(255,255,255,0.75)";
            ctx.shadowBlur = 3 + s.r * 1.8;

            fill(255, 255 * STAR_ALPHA * k * fade);
            circle(pos[i].x, pos[i].y, s.r * 2 * (0.5 + 0.5 * k));

            ctx.shadowBlur = 0;
            ctx.shadowColor = "transparent";

        });

    }

    // ---------------------------------------------------------
    // p5 hooks (called from setup / windowResized / mousePressed above)
    // ---------------------------------------------------------
    function setup() {

        if (touchOnly) {
            noCanvas();
            noLoop();
            return;
        }

        const cnv = createCanvas(windowWidth, windowHeight);
        cnv.elt.classList.add("constellation-canvas");
        cnv.elt.setAttribute("aria-hidden", "true");
        pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
        noLoop();                                      // only runs while something is on screen

    }

    function pressed(e) {

        if (touchOnly) return;
        if (e && e.button !== undefined && e.button !== 0) return;

        const now = millis();

        sets.push(generate(mouseX, mouseY, now));

        // too many on screen: the oldest ones fade out early
        const alive = sets.filter(c => now - c.born < c.fadeAt);
        if (alive.length > MAX_ON_SCREEN) {
            alive.slice(0, alive.length - MAX_ON_SCREEN).forEach(c => {
                c.fadeAt = now - c.born;
                c.fadeLen = 1500;
            });
        }

        loop();

    }

    return { setup, draw, pressed };

})() : null;