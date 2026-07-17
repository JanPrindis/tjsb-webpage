import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DateTime } from "luxon";

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ignoreMobileResize: true});

const DAYS_BEFORE_NEXT_MATCH = 3.5;
const MIN_RESULT_HOURS = 24;
const END_OF_SEASON_DAYS = 7;
let heroInterval = null;

async function initData() {
    try {
        const response = await fetch('/data.json');
        const matches = await response.json();

        // --- DEBUG TRIGGER ---
        // Works if URL contains ?debug=true
        if (window.location.search.includes('debug=true')) {
            runDebugMode(matches);
            document.getElementById('current-year').textContent = new Date().getFullYear().toString();
            return;
        }
        // -------------------------

        const activeMatch = findActiveMatch(matches);
        if (activeMatch) {
            renderHeroMatch(activeMatch);
        } else {
            document.getElementById('active-match-container').innerHTML = `
                <div class="season-end-wrapper">
                    <div class="state-label">Těšíme se na vás příští sezónu</div>
                    <div class="huge-text">SEZÓNA SKONČILA!</div>
                </div>
            `;
        }

        renderSchedule(matches, activeMatch);
        document.getElementById('current-year').textContent = new Date().getFullYear().toString();
    } catch (error) {
        document.getElementById('active-match-container').innerHTML = '<div style="color:white;">Chyba dat.</div>';
        console.log(error);
    }
}

function findActiveMatch(matches) {
    const now = DateTime.now().setZone('Europe/Prague');
    let prevMatch = null;
    let nextMatch = null;

    // Get last and upcoming match
    for (let i = 0; i < matches.length; i++) {
        const matchDate = DateTime.fromISO(`${matches[i].date}T${matches[i].time}:00`, { zone: 'Europe/Prague' });
        if (matchDate > now) {
            nextMatch = matches[i];
            if (i > 0) {
                prevMatch = matches[i - 1];
            }
            break;
        }
    }

    // If end of season
    if (!nextMatch && matches.length > 0) {
        prevMatch = matches[matches.length - 1];
    }

    if (prevMatch) {
        const prevMatchDate = DateTime.fromISO(`${prevMatch.date}T${prevMatch.time}:00`, { zone: 'Europe/Prague' });
        const hoursSincePrev = now.diff(prevMatchDate, 'hours').hours;

        // Result has to be visible for at least 24 hours
        if (hoursSincePrev < MIN_RESULT_HOURS) {
            return prevMatch;
        }

        // End of season mode
        if (!nextMatch) {
            if (hoursSincePrev < END_OF_SEASON_DAYS * 24) {
                return prevMatch;
            }
            return null;
        }
    }

    // Minimal result time has been satisfied
    if (nextMatch) {
        const nextMatchDate = DateTime.fromISO(`${nextMatch.date}T${nextMatch.time}:00`, { zone: 'Europe/Prague' });;
        const daysUntilNext = nextMatchDate.diff(now, 'days').days;

        // Check how long until next match
        if (daysUntilNext <= DAYS_BEFORE_NEXT_MATCH) {
            return nextMatch;
        } else {
            return prevMatch ? prevMatch : nextMatch;
        }
    }

    return null;
}

function renderHeroMatch(match) {
    const container = document.getElementById('active-match-container');
    const matchDate = DateTime.fromISO(`${match.date}T${match.time}:00`, { zone: 'Europe/Prague' });
    container.innerHTML = `
    <div id="dynamic-state-area" class="state-area"></div>
    <div class="match-card">
      <div class="vs-row">
        <div class="team">
          <div class="team-logo-wrapper"><img src="${match.homeLogo}"></div>
          <div class="team-name">${match.homeTeam}</div>
        </div>
        <div class="vs-badge">VS</div>
        <div class="team">
          <div class="team-logo-wrapper"><img src="${match.awayLogo}"></div>
          <div class="team-name">${match.awayTeam}</div>
        </div>
      </div>
      <div class="match-meta">
        <span>📅 ${matchDate.toFormat('d. M. yyyy')}</span>
        <span>⏱️ ${match.time}</span>
        <span>📍 ${match.location}</span>
      </div>
    </div>
  `;
    updateMatchState(match, matchDate);

    if (heroInterval) clearInterval(heroInterval);
    heroInterval = setInterval(() => updateMatchState(match, matchDate), 1000);
}

function updateMatchState(match, matchDate) {
    const now = DateTime.now().setZone('Europe/Prague');
    const stateArea = document.getElementById('dynamic-state-area');
    if (!stateArea) return;

    if (match.homeScore !== null) {
        stateArea.innerHTML = `<div class="state-label">VÝSLEDEK</div><div class="huge-text">${match.homeScore} : ${match.awayScore}</div>`;
        if (heroInterval) clearInterval(heroInterval);
        return;
    }
    const diff = matchDate.diff(now, ['days', 'hours', 'minutes', 'seconds']);

    if (diff <= 0) {
        stateArea.innerHTML = `<div class="huge-text live-text">HRAJEME!</div>`;
        return;
    }
    const duration = diff.toObject();
    const d = Math.floor(duration.days) || 0;
    const h = Math.floor(duration.hours) || 0;
    const m = Math.floor(duration.minutes) || 0;
    const s = Math.floor(duration.seconds) || 0;

    stateArea.innerHTML = `<div class="state-label">VÝKOP ZA</div><div class="huge-text">${d > 0 ? d + 'd ' : ''}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}</div>`;
}

function renderSchedule(matches, activeMatch) {
    const container = document.getElementById('schedule-container');
    let html = '';
    const now = DateTime.now().setZone('Europe/Prague');

    matches.forEach(match => {
        const matchDate = DateTime.fromISO(`${match.date}T${match.time}:00`, { zone: 'Europe/Prague' });
        const isPlayed = match.homeScore !== null;

        // Calculate match state
        const diff = matchDate.diff(now);
        const isLive = diff <= 0 && !isPlayed;

        let scoreStr = 'VS';
        let scoreClass = 'is-upcoming';
        let rowClass = 'schedule-row';

        // Set match CSS class based on state
        if (isPlayed) {
            scoreStr = `${match.homeScore} : ${match.awayScore}`;
            scoreClass = 'is-played';
            rowClass += ' played-row';
        } else if (isLive) {
            scoreStr = 'LIVE';
            scoreClass = 'is-live';
        }

        // Highlight active match
        if (match === activeMatch) {
            rowClass += ' active-row';
        }

        html += `
      <div class="${rowClass}">
        <div class="s-date-box">
          <span class="s-date-day">${formatDateShort(matchDate)}</span>
          <span class="s-date-time">${match.time}</span>
        </div>
        <div class="s-match-box">
          <div class="s-team s-home">${match.homeTeam}</div>
          <div class="s-score-badge ${scoreClass}">${scoreStr}</div>
          <div class="s-team s-away">${match.awayTeam}</div>
        </div>
      </div>
    `;
    });
    container.innerHTML = html;
}

function formatDateShort(dateObj) {
    return dateObj.toFormat('d. M.');
}

// --- VIEWPORT LOCKING LOGIC ---
let lockedVH = window.innerHeight;
let lastWidth = window.innerWidth;

function setViewportHeight() {
    lockedVH = window.innerHeight;
    // CSS variable representing 1% of the locked viewport height
    document.documentElement.style.setProperty('--vh', `${lockedVH * 0.01}px`);
}

// Run once on initial load
setViewportHeight();

// Only recalculate if the device is rotated (horizontal resize)
window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - lastWidth) > 20) {
        lastWidth = window.innerWidth;
        setViewportHeight();
        ScrollTrigger.refresh(); // Tell GSAP to update if orientation changes
    }
});

function initScrollAnimation() {
    const tl = gsap.timeline({
        scrollTrigger: {
            start: 0,
            // Use lockedVH instead of window.innerHeight
            end: () => lockedVH * 0.4,
            scrub: 0.2,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
                if (self.progress > 0.8) {
                    document.body.classList.add('scrolled-deep');
                } else {
                    document.body.classList.remove('scrolled-deep');
                }
            }
        }
    });

    // Hero collapse, card scale & move
    tl.fromTo(document.documentElement,
        { "--scroll": 0 },
        {
            "--scroll": 1,
            ease: "none"
        },
        0
    );

    // The Result List Translation
    tl.fromTo(".content",
        { y: 0 },
        {
            y: () => -(lockedVH * 0.25),
            ease: "none"
        },
        0
    );
}


function runDebugMode(matches) {
    console.log("🛠️ DEBUG MODE START...");
    let currentIndex = 0;
    let currentState = 0; // 0 = Upcoming, 1 = Live, 2 = Played, 3 = End of season
    const states = ['Countdown', 'LIVE', 'Result', 'End of season'];

    // Clear original active-match-container just to be safe
    document.getElementById('active-match-container').innerHTML = '';

    setInterval(() => {
        if (matches.length === 0) return;

        const originalMatch = matches[currentIndex];
        let fakeMatch = {...originalMatch}; // Copy in order to not break original data
        const now = DateTime.now().setZone('Europe/Prague');

        console.log(`Testing: ${fakeMatch.homeTeam} vs ${fakeMatch.awayTeam} | State: ${states[currentState]}`);

        if (currentState === 0) {
            // COUNTDOWN
            const future = now.plus({ days: 2, hours: 3 });
            fakeMatch.date = future.toISODate();
            fakeMatch.time = future.toFormat('HH:mm')
            fakeMatch.homeScore = null;
            fakeMatch.awayScore = null;
        } else if (currentState === 1) {
            // LIVE
            fakeMatch.date = now.toISODate();
            fakeMatch.time = now.toFormat('HH:mm')
            fakeMatch.homeScore = null;
            fakeMatch.awayScore = null;
        } else if (currentState === 2) {
            // RESULT
            fakeMatch.homeScore = fakeMatch.homeScore !== null ? fakeMatch.homeScore : Math.floor(Math.random() * 5);
            fakeMatch.awayScore = fakeMatch.awayScore !== null ? fakeMatch.awayScore : Math.floor(Math.random() * 5);
        }

        if (currentState === 3) {
            // END OF SEASON
            if (heroInterval) clearInterval(heroInterval);
            document.getElementById('active-match-container').innerHTML = `
                <div class="season-end-wrapper">
                    <div class="state-label">Těšíme se na vás příští sezónu</div>
                    <div class="huge-text">SEZÓNA SKONČILA!</div>
                </div>
            `;
            renderSchedule(matches, null);
        } else {
            // Modify match data
            const fakeMatches = [...matches];
            fakeMatches[currentIndex] = fakeMatch;

            // Draw
            renderHeroMatch(fakeMatch);
            renderSchedule(fakeMatches, fakeMatch);
        }

        // Move next step
        currentState++;
        if (currentState > 3) {
            currentState = 0;
            currentIndex++;
            if (currentIndex >= matches.length) {
                currentIndex = 0;
            }
        }
    }, 500);
}

// Initialize animations and data
initScrollAnimation();
initData().catch(error => console.log(error));

// Clickable scroll cue
const scrollIndicator = document.querySelector('.scroll-indicator-wrapper');
if (scrollIndicator) {
    scrollIndicator.addEventListener('click', () => {
        window.scrollTo({
            top: lockedVH * 0.7,
            behavior: 'smooth'
        });
    });
}