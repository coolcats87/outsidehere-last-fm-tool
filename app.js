// ─── DOM REFS ──────────────────────────────────────────────────────────────
const homeView        = document.getElementById('homeView');
const loadingView     = document.getElementById('loadingView');
const resultsView     = document.getElementById('resultsView');
const calculateButton = document.getElementById('calculateButton');
const usernameInput   = document.getElementById('usernameInput');
const statusLog       = document.getElementById('status-log');
const progressBar     = document.getElementById('progress-bar');
const cancelButton    = document.getElementById('cancelBtn');
const resAlbumReplay  = document.getElementById('res-album-replay');
const resTopArtistPct = document.getElementById('res-top-artist-pct');
const resScrobblesDay = document.getElementById('res-scrobbles-day');
const resVerdict = document.getElementById('res-verdict');

// Result elements
const resUsername     = document.getElementById('res-username');
const resGenre = document.getElementById('res-genre');
const resDaily        = document.getElementById('res-daily');
const resTrackReplay  = document.getElementById('res-track-replay');
const resArtistReplay = document.getElementById('res-artist-replay');
const resArtists      = document.getElementById('res-artists');
const resTracks       = document.getElementById('res-tracks');
const resAvgSong      = document.getElementById('res-avg-song');

// ─── API KEY ────────────────────────────────────────────────────────────────
const API_KEY = 'e2411789b9b6d7ec6e5510370e702d56';

// ─── HELPERS ────────────────────────────────────────────────────────────────
function logStatus(message) {
  const p = document.createElement('p');
  p.textContent = message;
  statusLog.appendChild(p);
  statusLog.scrollTop = statusLog.scrollHeight;
}

function setProgress(pct) {
  progressBar.style.width = pct + '%';
}

// ─── EVENT LISTENERS ────────────────────────────────────────────────────────
calculateButton.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  if (!username) { alert('Please enter a username!'); return; }

  homeView.classList.add('hidden');
  loadingView.classList.remove('hidden');

  const rawData = await fetchData(username);
  if (rawData) {
    const stats = calculateStats(rawData);
    displayResults(stats, rawData);
  } else {
    logStatus('No data to calculate stats.');
    alert('Failed to fetch data. Please check the username and try again.');
    location.reload();
  }
});

cancelButton.addEventListener('click', () => location.reload());

usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') calculateButton.click();
});

// ─── FETCH HELPERS ──────────────────────────────────────────────────────────
async function fetchAllPages(type, username, count, period = 'overall') {
  let allData = [];
  let currentPage = 1;
  let totalPages = 1;
  let totalItemsGlobal = 0;
  const isAllTime = count === 'all';

  do {
    const limit = isAllTime ? 200 : count;
    const url = `https://ws.audioscrobbler.com/2.0/?method=${type}&user=${username}&api_key=${API_KEY}&limit=${limit}&page=${currentPage}&period=${period}&format=json`;
    const res = await fetch(url);
    const data = await res.json();
    const rootKey = Object.keys(data)[0];
    const listKey = Object.keys(data[rootKey]).find(key => key !== '@attr');

    if (currentPage === 1) {
      totalPages = isAllTime ? parseInt(data[rootKey]['@attr'].totalPages) : 1;
      totalItemsGlobal = parseInt(data[rootKey]['@attr'].total);
      logStatus(`${rootKey}: ${totalItemsGlobal} total items detected`);
    }

    allData = allData.concat(data[rootKey][listKey]);
    logStatus(`Page ${currentPage}/${totalPages} — ${allData.length} items fetched`);
    currentPage++;
  } while (currentPage <= totalPages);

  return { data: allData, total: totalItemsGlobal };
}

async function fetchData(username) {
  try {
    const parseNum = document.getElementById('limitInput').value;
    const period   = document.getElementById('periodInput').value;

    logStatus(`Starting fetch for: ${username}`);
    setProgress(5);

    const infoRes = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${username}&api_key=${API_KEY}&format=json`);
    const infoData = await infoRes.json();
    if (infoData.error) throw new Error(infoData.message);

    logStatus(`Profile loaded`);
    setProgress(15);

    logStatus('Fetching top artists...');
    setProgress(25);
    const artistResult = await fetchAllPages('user.gettopartists', username, parseNum, period);
    setProgress(40);

    logStatus('Fetching top albums...');
    const albumResult = await fetchAllPages('user.gettopalbums', username, parseNum, period);
    setProgress(55);

    logStatus('Fetching top tracks...');
    const trackResult = await fetchAllPages('user.gettoptracks', username, parseNum, period);
    setProgress(70);

    // 1. Get the CORRECT total scrobbles for the chosen period
    let totalScrobbles = 0;
    if (period === 'overall') {
      totalScrobbles = parseInt(infoData.user.playcount);
    } else {
      // Calculate the 'from' timestamp (Current time minus period in seconds)
      const nowUnix = Math.floor(Date.now() / 1000);
      const secondsMap = {
        '7day':    7 * 86400,
        '1month':  30 * 86400,
        '3month':  90 * 86400,
        '6month':  180 * 86400,
        '12month': 365 * 86400
      };
      const fromTimestamp = nowUnix - secondsMap[period];
      
      // We use getrecenttracks because it's the only way to get a raw total for a time range
      const totalUrl = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${API_KEY}&limit=1&from=${fromTimestamp}&format=json`;
      const totalRes = await fetch(totalUrl);
      const totalData = await totalRes.json();
      
      // This '@attr.total' is the ACTUAL count of every play in that range
      totalScrobbles = parseInt(totalData.recenttracks['@attr'].total);
    }
    
    logStatus(`Actual period scrobbles: ${totalScrobbles.toLocaleString()}`);

    logStatus(`Global scrobbles for this period: ${totalScrobbles.toLocaleString()}`);
    logStatus('Sampling track durations...');
    const tracklengths = await getSampleTracks(trackResult.data);
    setProgress(85);

    const registrationUnix = parseInt(infoData.user.registered['#text']);
    logStatus('Crunching the numbers...');
    setProgress(90);

    logStatus('Analyzing genre profile...');
    const topGenre = await fetchTopGenre(artistResult.data);

    return {
      user: username,
      totalScrobbles,
      topGenre,
      joinedUnix: registrationUnix,
      period,
      artists: artistResult.data,
      totalUniqueArtists: artistResult.total,   // true unique artist count for period
      albums: albumResult.data,
      totalUniqueAlbums: albumResult.total,
      tracks: trackResult.data,
      totalUniqueTracks: trackResult.total,     // true unique track count for period
      durations: tracklengths,
    };
  } catch (error) {
    logStatus(`Error: ${error.message}`);
    alert(`Error fetching data: ${error.message}`);
    location.reload();
  }
}

async function getSampleTracks(allTracks) {
  let totalDuration = 0;
  let validCount = 0;

  for (let i = 0; i < allTracks.length; i++) {
    let shouldSample = false;
    if (i < 50)       shouldSample = true;
    else if (i < 150) shouldSample = (i % 10 === 0);
    else              shouldSample = (i % 25 === 0);

    if (shouldSample) {
      try {
        const track = allTracks[i];
        const url = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${API_KEY}&artist=${encodeURIComponent(track.artist.name)}&track=${encodeURIComponent(track.name)}&format=json`;
        const res = await fetch(url);
        const data = await res.json();
        const length = parseInt(data?.track?.duration) || 0;
        if (length !== 0) {
          validCount++;
          totalDuration += length / 1000;
          logStatus(`Sampled "${track.name}" — ${(length / 1000).toFixed(0)}s`);
        } else {
          logStatus(`No duration for "${track.name}", skipping`);
        }
      } catch (error) {
        logStatus(`Error sampling "${allTracks[i].name}": ${error.message}`);
      }
    }
  }
  return { totalDuration, validCount };
}

// ─── STATS ──────────────────────────────────────────────────────────────────
function calculateStats(data) {
  logStatus('Calculating statistics...');
  setProgress(95);

  const periodDays = {
    '7day':    7,
    '1month':  30,
    '3month':  90,
    '6month':  180,
    '12month': 365,
    'overall': Math.max(1, (Math.floor(Date.now() / 1000) - data.joinedUnix) / 86400)
  };
  const daysActive = Math.max(1, periodDays[data.period] ??
    (Math.floor(Date.now() / 1000) - data.joinedUnix) / 86400);

  let avgSongLengthSeconds = 210;
  if (data.durations.validCount > 0) {
    avgSongLengthSeconds = data.durations.totalDuration / data.durations.validCount;
  }

  const totalListeningSeconds = data.totalScrobbles * avgSongLengthSeconds;
  const totalListeningHours   = (totalListeningSeconds / 3600).toFixed(1);
  const dailyAverageMinutes   = Math.round((totalListeningSeconds / 60) / daysActive);const trackReplay  = (data.totalScrobbles / Math.max(1, data.totalUniqueTracks)).toFixed(2);
  const artistReplay = (data.totalScrobbles / Math.max(1, data.totalUniqueArtists)).toFixed(2);
  const albumReplay  = (data.totalScrobbles / Math.max(1, data.totalUniqueAlbums)).toFixed(2);
  
  let topArtistPct = '0';
  if (data.artists.length > 0 && data.totalScrobbles > 0) {
    topArtistPct = ((parseInt(data.artists[0].playcount) / data.totalScrobbles) * 100).toFixed(1);
  }

  const scrobblesPerDay = (data.totalScrobbles / daysActive).toFixed(1);


  setProgress(100);
  logStatus('Done! Rendering results.');

  return {
    username: data.user,
    totalHours: totalListeningHours,
    dailyMinutes: dailyAverageMinutes,
    avgSongMins: (avgSongLengthSeconds / 60).toFixed(2),
    trackReplay,
    artistReplay,
    albumReplay,
    topArtistPct,
    scrobblesPerDay,
    topGenre: data.topGenre,
    topArtist: data.artists.length > 0 ? data.artists[0].name : 'None',
    topTrack:  data.tracks.length  > 0 ? data.tracks[0].name  : 'None',
  };
}

// ─── DISPLAY ────────────────────────────────────────────────────────────────
function buildList(items, container) {
  const maxPlays = items.length > 0 ? parseInt(items[0].playcount) : 1;
  container.innerHTML = '';

  items.slice(0, 10).forEach((item, i) => {
    const rank = i + 1;
    const plays = parseInt(item.playcount);
    const barWidth = Math.round((plays / maxPlays) * 100);
    const name = item.name;

    let rankClass = '';
    if (rank === 1)      rankClass = 'gold';
    else if (rank === 2) rankClass = 'silver';
    else if (rank === 3) rankClass = 'bronze';

    const li = document.createElement('li');
    li.innerHTML = `
      <span class="rank-num ${rankClass}">${rank}</span>
      <span class="rank-name" title="${name}">${name}</span>
      <div class="rank-bar-wrap">
        <div class="rank-bar" style="width: ${barWidth}%"></div>
      </div>
      <span class="rank-plays">${plays.toLocaleString()}</span>
    `;
    container.appendChild(li);
  });
}

async function fetchTopGenre(artists) {
  const genreCount = {};
  const ignoreTags = ['seen live', 'favorites', 'awesome', 'cool', 'favorite artists'];
  
  // Check the top 5 artists to get a good vibe sample
  const topFive = artists.slice(0, 5);
  
  for (const artist of topFive) {
    try {
      const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getTopTags&artist=${encodeURIComponent(artist.name)}&api_key=${API_KEY}&format=json`;
      const res = await fetch(url);
      const data = await res.json();
      
      const tags = data.toptags?.tag?.slice(0, 5) || [];
      tags.forEach(t => {
        const tagName = t.name.toLowerCase();
        if (!ignoreTags.includes(tagName)) {
          genreCount[tagName] = (genreCount[tagName] || 0) + 1;
        }
      });
    } catch (e) { console.error("Tag fetch failed", e); }
  }

  const sortedGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]);
  return sortedGenres.length > 0 ? sortedGenres[0][0] : 'Unknown';
}

function displayResults(stats, rawData) {
  const specialMsg = easterEggs(stats, rawData);

  const genreEl = document.getElementById('res-genre');
  const genreName = stats.topGenre;
  
  genreEl.textContent = genreName;
  
  if (genreName.length > 10) {
    genreEl.style.fontSize = '1.4rem'; // Shrink for long names
  } else if (genreName.length > 15) {
    genreEl.style.fontSize = '1.1rem';
  }

  // Update the sub-text to be more "Pro"
  const genreSub = genreEl.nextElementSibling;
  genreSub.innerHTML = `<span class="genre-badge">Sonic DNA</span>`;

  resVerdict.textContent = specialMsg || "";
  resUsername.textContent     = stats.username;
  resGenre.textContent = stats.topGenre;
  resDaily.textContent        = stats.dailyMinutes; 
  resTrackReplay.textContent  = stats.trackReplay + 'x';
  resArtistReplay.textContent = stats.artistReplay + 'x';
  resAvgSong.textContent      = stats.avgSongMins;
  resAlbumReplay.textContent  = stats.albumReplay + 'x';
  resTopArtistPct.textContent = stats.topArtistPct + '%';
  resScrobblesDay.textContent = stats.scrobblesPerDay;
    

  buildList(rawData.artists, resArtists);
  buildList(rawData.tracks,  resTracks);

  loadingView.classList.add('hidden');
  resultsView.classList.remove('hidden');
}

function easterEggs(stats, rawData) {
    const user = stats.username.toLowerCase();
    let specialMsg = "";
    
    // All names must be lowercase here to match user.toLowerCase()
    if (user === 'legionz78') {
        specialMsg = "Welcome back, Creator";
    }
    else if (user === 'susususu-idk') {
        specialMsg = "Welcome back, Co-driver";
    }
    else if (user === 'sa_paaa') {
        specialMsg = "Welcome, SP";
    }
    else if (user === 'rusty-fox') {
        specialMsg = "Welcome back, Stupid!";
    }
    else if (user === 'zuracaruz') {
        specialMsg = "Welcome back da paithiyam :D!";
    }

    return specialMsg;
}

// ─── KONAMI CODE: FESTIVAL MODE ──────────────────────────────────────────
const konamiCode = [
  'ArrowUp', 'ArrowUp', 
  'ArrowDown', 'ArrowDown', 
  'ArrowLeft', 'ArrowRight', 
  'ArrowLeft', 'ArrowRight', 
  'b', 'a'
];
let konamiIndex = 0;

document.addEventListener('keydown', (e) => {
  // We check lowercase to ensure 'B' or 'A' works regardless of Caps Lock
  const key = e.key.toLowerCase();
  const targetKey = konamiCode[konamiIndex].toLowerCase();

  if (key === targetKey) {
    konamiIndex++;
    if (konamiIndex === konamiCode.length) {
      activateFestivalMode();
      konamiIndex = 0;
    }
  } else {
    konamiIndex = 0;
  }
});

function activateFestivalMode() {
  // 1. Theme Shift
  document.documentElement.style.setProperty('--red', '#d4a030');
  document.documentElement.style.setProperty('--red-glow', 'rgba(212, 160, 48, 0.4)');
  
  logStatus("✨ SYSTEM: 'Platinum Edition unlocked. Dropping the beat...'");

  // 2. Trigger Emoji Rain
  const emojis = ['🎵', '🎶', '🎸', '🎹', '🎷', '🥁', '🎧', '📻', '🎙️', '💿', '🔥'];
  
  for (let i = 0; i < 60; i++) {
    setTimeout(() => {
      const emoji = document.createElement('div');
      emoji.className = 'music-emoji';
      emoji.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      
      // Randomize position and speed
      emoji.style.left = Math.random() * 100 + 'vw';
      emoji.style.animationDuration = (Math.random() * 2 + 2) + 's'; // 2-4 seconds
      emoji.style.fontSize = (Math.random() * 20 + 20) + 'px'; // 20-40px
      
      document.body.appendChild(emoji);

      // Clean up DOM after animation
      setTimeout(() => emoji.remove(), 4000);
    }, i * 80); // Stagger the start times for a "rain" effect
  }
}