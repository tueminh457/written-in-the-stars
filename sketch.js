// ============================================================
// NATAL CHART
// P5.JS + WORLDWIDE LOCATION + ASTROWAY / SWISS EPHEMERIS
//
// MAIN PLANETS ONLY:
// Sun, Moon, Mercury, Venus, Mars,
// Jupiter, Saturn, Uranus, Neptune, Pluto
// + Ascendant / Rising
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


placeInput.addEventListener(
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


birthDate.addEventListener(
    "change",
    checkForm
);


birthTime.addEventListener(
    "change",
    checkForm
);


// ============================================================
// GENERATE CHART
// ============================================================

generateBtn.addEventListener(
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


        // ----------------------------------------------------
        // DISPLAY
        // ----------------------------------------------------

        displayResults();


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


    result.classList.remove(
        "hidden"
    );


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


    document
        .getElementById(
            "risingSign"
        )
        .textContent =
        risingSign;


    document
        .getElementById(
            "risingDegree"
        )
        .textContent =
        formatDegree(
            risingDegree
        );


    // ========================================================
    // BIRTH SUMMARY
    // ========================================================

    document
        .getElementById(
            "birthSummary"
        )
        .textContent =
        `${birthDate.value} · ${birthTime.value} · ${selectedLocation.name}, ${selectedLocation.country}`;


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

    statusText.textContent =
        message;

}


// ============================================================
// P5.JS
// ============================================================

function setup() {

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

    resizeCanvas(
        min(
            windowWidth,
            700
        ),
        600
    );

}