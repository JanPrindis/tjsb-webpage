const SWITCH_DAY = 4;
let heroInterval = null;

async function initHypeSite() {
    try {
        const response = await fetch('/data.json');
        const matches = await response.json();

        // --- DEBUG TRIGGER ---
        // Works if URL contains ?debug=true
        if (window.location.search.includes('debug=true')) {
            runDebugMode(matches);
            document.getElementById('current-year').textContent = new Date().getFullYear();
            return;
        }
        // -------------------------

        const activeMatch = findActiveMatch(matches);
        if (activeMatch) renderHeroMatch(activeMatch);
        else document.getElementById('active-match-container').innerHTML = '<h2 style="color:white;">Sezóna skončila!</h2>';

        renderSchedule(matches, activeMatch);
        document.getElementById('current-year').textContent = new Date().getFullYear();
    } catch (error) {
        document.getElementById('active-match-container').innerHTML = '<div style="color:white;">Chyba dat.</div>';
        console.log(error);
    }
}

function findActiveMatch(matches) {
    const now = new Date();
    for (const match of matches) {
        const matchDate = new Date(`${match.date}T${match.time}:00`);
        if (matchDate > now) return match;
        if ((now - matchDate) / (1000 * 60 * 60 * 24) < 4) return match;
    }
    return null;
}

function renderHeroMatch(match) {
    const container = document.getElementById('active-match-container');
    const matchDate = new Date(`${match.date}T${match.time}:00`);
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
        <span>📅 ${matchDate.toLocaleDateString('cs-CZ')}</span>
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
    const now = new Date();
    const stateArea = document.getElementById('dynamic-state-area');
    if (!stateArea) return;
    if (match.homeScore !== null) {
        stateArea.innerHTML = `<div class="state-label">VÝSLEDEK</div><div class="huge-text">${match.homeScore} : ${match.awayScore}</div>`;
        return;
    }
    const diff = matchDate - now;
    if (diff <= 0) {
        stateArea.innerHTML = `<div class="huge-text live-text">HRAJEME!</div>`;
        return;
    }
    const d = Math.floor(diff / 864e5), h = Math.floor((diff / 36e5) % 24), m = Math.floor((diff / 6e4) % 60),
        s = Math.floor((diff / 1e3) % 60);
    stateArea.innerHTML = `<div class="state-label">VÝKOP ZA</div><div class="huge-text">${d > 0 ? d + 'd ' : ''}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}</div>`;
}

function renderSchedule(matches, activeMatch) {
    const container = document.getElementById('schedule-container');
    let html = '';
    const now = new Date();

    matches.forEach(match => {
        const matchDate = new Date(`${match.date}T${match.time}:00`);
        const isPlayed = match.homeScore !== null;

        // Calculate match state
        const diff = matchDate - now;
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
    return dateObj.toLocaleDateString('cs-CZ', {day: 'numeric', month: 'numeric'});
}

window.addEventListener('scroll', () => {
    const progress = Math.min(window.scrollY / (window.innerHeight * 0.4), 1);
    document.documentElement.style.setProperty('--scroll', progress);
    if (progress > 0.8) document.body.classList.add('scrolled-deep');
    else document.body.classList.remove('scrolled-deep');
});

function runDebugMode(matches) {
    console.log("🛠️ DEBUG MODE START...");
    let currentIndex = 0;
    let currentState = 0; // 0 = Upcoming, 1 = Live, 2 = Played
    const states = ['Countdown', 'LIVE', 'Result'];

    // Clear original active-match-container just to be safe
    document.getElementById('active-match-container').innerHTML = '';

    setInterval(() => {
        if (matches.length === 0) return;

        const originalMatch = matches[currentIndex];
        let fakeMatch = {...originalMatch}; // Copy in order to not break original data
        const now = new Date();

        console.log(`Testing: ${fakeMatch.homeTeam} vs ${fakeMatch.awayTeam} | State: ${states[currentState]}`);

        if (currentState === 0) {
            // COUNTDOWN
            const future = new Date(now.getTime() + (2 * 86400000) + (3 * 3600000));
            fakeMatch.date = future.toISOString().split('T')[0];
            fakeMatch.time = future.toTimeString().substring(0, 5);
            fakeMatch.homeScore = null;
            fakeMatch.awayScore = null;
        } else if (currentState === 1) {
            // LIVE
            fakeMatch.date = now.toISOString().split('T')[0];
            fakeMatch.time = now.toTimeString().substring(0, 5);
            fakeMatch.homeScore = null;
            fakeMatch.awayScore = null;
        } else if (currentState === 2) {
            // RESULT
            fakeMatch.homeScore = fakeMatch.homeScore !== null ? fakeMatch.homeScore : Math.floor(Math.random() * 5);
            fakeMatch.awayScore = fakeMatch.awayScore !== null ? fakeMatch.awayScore : Math.floor(Math.random() * 5);
        }

        // Modify match data
        const fakeMatches = [...matches];
        fakeMatches[currentIndex] = fakeMatch;

        // Draw
        renderHeroMatch(fakeMatch);
        renderSchedule(fakeMatches, fakeMatch);

        // Move next step
        currentState++;
        if (currentState > 2) {
            currentState = 0;
            currentIndex++;
            if (currentIndex >= matches.length) {
                currentIndex = 0;
            }
        }
    }, 500);
}

initHypeSite();