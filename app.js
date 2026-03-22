// ─── DOM REFS ──────────────────────────────────────────────────────────────
const homeView        = document.getElementById('homeView');
const loadingView     = document.getElementById('loadingView');
const resultsView     = document.getElementById('resultsView');
const compatView      = document.getElementById('compatView');
const calculateButton = document.getElementById('calculateButton');
const usernameInput   = document.getElementById('usernameInput');
const statusLog       = document.getElementById('status-log');
const progressBar     = document.getElementById('progress-bar');
const cancelButton    = document.getElementById('cancelBtn');
const resVerdict      = document.getElementById('res-verdict');
const modeToggle      = document.getElementById('modeToggle');
const friendGroup     = document.getElementById('friendInputGroup');
const friendInput     = document.getElementById('friendInput');
const resUsername     = document.getElementById('res-username');
const resGenre        = document.getElementById('res-genre');
const resDaily        = document.getElementById('res-daily');
const resTrackReplay  = document.getElementById('res-track-replay');
const resArtistReplay = document.getElementById('res-artist-replay');
const resAvgSong      = document.getElementById('res-avg-song');
const resAlbumReplay  = document.getElementById('res-album-replay');
const resTopArtistPct = document.getElementById('res-top-artist-pct');
const resScrobblesDay = document.getElementById('res-scrobbles-day');
const resListenAge    = document.getElementById('res-listen-age');
const resListenEra    = document.getElementById('res-listen-era');
const resPeakHour     = document.getElementById('res-peak-hour');
const resObsession    = document.getElementById('res-obsession');
const adSlot          = document.getElementById('ad-slot');
const resArtists      = document.getElementById('res-artists');
const resTracks       = document.getElementById('res-tracks');

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const API_KEY        = 'e2411789b9b6d7ec6e5510370e702d56';
const BLANK_IMG      = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAI=';
const LASTFM_NOIMAGE = '2a96cbd8b46e442fc41c2b86b821562f';
const CLOUD_COLORS   = ['var(--red)', '#5b8dee', '#3ecf8e', '#d4a030', '#c084fc', '#fb923c', '#38bdf8', '#f472b6'];

// ─── HELPERS ────────────────────────────────────────────────────────────────
function bestImg(imageArr) {
  if (!imageArr || !imageArr.length) return BLANK_IMG;
  for (const idx of [3, 2, 1, 0]) {
    const url = imageArr[idx]?.['#text'];
    if (url && url.trim() !== '' && !url.includes(LASTFM_NOIMAGE)) return url;
  }
  return BLANK_IMG;
}

function hasRealImage(imageArr) {
  return imageArr?.some(i => {
    const url = i['#text']?.trim();
    return url && !url.includes(LASTFM_NOIMAGE);
  });
}

function itunesImgArray(url100) {
  const large = url100.replace(/\d+x\d+bb/, '600x600bb');
  return [{ '#text': url100 }, { '#text': url100 }, { '#text': large }, { '#text': large }];
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function logStatus(message) {
  const p = document.createElement('p');
  p.textContent = message;
  statusLog.appendChild(p);
  statusLog.scrollTop = statusLog.scrollHeight;
}

function setProgress(pct) { progressBar.style.width = pct + '%'; }

// ─── EVENT LISTENERS ────────────────────────────────────────────────────────
modeToggle.addEventListener('change', () => {
  friendGroup.classList.toggle('hidden', !modeToggle.checked);
});

calculateButton.addEventListener('click', async () => {
  const username   = usernameInput.value.trim();
  const friendName = friendInput.value.trim();
  const isCompat   = modeToggle.checked;

  if (!username) { alert('Please enter a username!'); return; }
  if (isCompat && !friendName) { alert("Please enter a friend's username for compatibility mode!"); return; }

  homeView.classList.add('hidden');
  loadingView.classList.remove('hidden');

  logStatus(`Fetching primary user: ${username}...`);
  const rawData = await fetchData(username);
  if (!rawData) return;

  if (isCompat) {
    setProgress(0);
    logStatus(`Fetching friend: ${friendName}...`);
    const friendRaw = await fetchData(friendName);
    if (!friendRaw) return;
    logStatus('Running compatibility analysis...');
    const compData = await calculateCompatibility(rawData, friendRaw);
    displayCompatibility(rawData, friendRaw, compData);
  } else {
    const stats = calculateStats(rawData);
    displayResults(stats, rawData);
  }
});

cancelButton.addEventListener('click', () => location.reload());
usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') calculateButton.click(); });

// ─── FETCH HELPERS ──────────────────────────────────────────────────────────
async function fetchAllPages(type, username, count, period = 'overall') {
  let allData = [], currentPage = 1, totalPages = 1, totalItemsGlobal = 0;
  const isAllTime = count === 'all';
  do {
    const limit = isAllTime ? 200 : count;
    const url   = `https://ws.audioscrobbler.com/2.0/?method=${type}&user=${username}&api_key=${API_KEY}&limit=${limit}&page=${currentPage}&period=${period}&format=json`;
    const res   = await fetch(url);
    const data  = await res.json();
    const rootKey = Object.keys(data)[0];
    const listKey = Object.keys(data[rootKey]).find(key => key !== '@attr');
    if (currentPage === 1) {
      totalPages       = isAllTime ? parseInt(data[rootKey]['@attr'].totalPages) : 1;
      totalItemsGlobal = parseInt(data[rootKey]['@attr'].total);
      logStatus(`${rootKey}: ${totalItemsGlobal} total items detected`);
    }
    allData = allData.concat(data[rootKey][listKey]);
    logStatus(`Page ${currentPage}/${totalPages} — ${allData.length} items fetched`);
    currentPage++;
  } while (currentPage <= totalPages);
  return { data: allData, total: totalItemsGlobal };
}

async function calculateListeningAge(albums) {
  let totalYear = 0, count = 0;
  for (const album of albums.slice(0, 10)) {
    try {
      const url  = `https://ws.audioscrobbler.com/2.0/?method=album.getInfo&api_key=${API_KEY}&artist=${encodeURIComponent(album.artist.name)}&album=${encodeURIComponent(album.name)}&format=json`;
      const res  = await fetch(url);
      const data = await res.json();
      const dateStr = data.album?.wiki?.published || data.album?.releasedate;
      if (dateStr) {
        const year = parseInt(dateStr.match(/\d{4}/));
        if (year > 1900 && year <= 2026) { totalYear += year; count++; }
      }
    } catch (e) {}
  }
  const avgYear = count > 0 ? Math.round(totalYear / count) : new Date().getFullYear();
  let generation = "Modernist";
  if (avgYear < 1980)      generation = "Vintage Soul";
  else if (avgYear < 2000) generation = "90s Kid";
  else if (avgYear < 2010) generation = "Y2K Era";
  else if (avgYear < 2018) generation = "Blog-Era Indie";
  return { avgYear, generation };
}

// Genre map weighted by artist rank — shared between single + compat
async function fetchGenreMap(artists, limit = 10) {
  const genreCount = {};
  const ignoreTags = ['seen live', 'favorites', 'awesome', 'cool', 'favorite artists', 'under 2000 listeners', 'all', 'seenlive', 'favoriteartists'];
  const slice = artists.slice(0, limit);
  for (let i = 0; i < slice.length; i++) {
    const weight = limit - i;
    try {
      const url  = `https://ws.audioscrobbler.com/2.0/?method=artist.getTopTags&artist=${encodeURIComponent(slice[i].name)}&api_key=${API_KEY}&format=json`;
      const res  = await fetch(url);
      const data = await res.json();
      const tags = data.toptags?.tag?.slice(0, 3) || [];
      tags.forEach(t => {
        // Normalise: strip hyphens so "k-pop" and "kpop" collapse to the same key
        const tagName = t.name.toLowerCase().replace(/-/g, '');
        if (!ignoreTags.includes(tagName))
          genreCount[tagName] = (genreCount[tagName] || 0) + weight;
      });
    } catch (e) {}
  }
  return genreCount;
}

async function fetchMainstreamScore(artists) {
  let totalListeners = 0, count = 0;
  for (const artist of artists.slice(0, 5)) {
    try {
      const url  = `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist=${encodeURIComponent(artist.name)}&api_key=${API_KEY}&format=json`;
      const res  = await fetch(url);
      const data = await res.json();
      const listeners = parseInt(data.artist?.stats?.listeners || 0);
      if (listeners > 0) { totalListeners += listeners; count++; }
      if (data.artist?.image?.length) artist.image = data.artist.image;
    } catch (e) {}
  }
  if (count === 0) return { score: 50, label: 'Balanced' };
  const avg   = totalListeners / count;
  const score = Math.min(100, Math.round((Math.log10(Math.max(1, avg)) / Math.log10(500000)) * 100));
  let label = 'Balanced';
  if (score >= 85)      label = 'Mainstream';
  else if (score >= 65) label = 'Popular';
  else if (score >= 45) label = 'Indie';
  else if (score >= 25) label = 'Underground';
  else                  label = 'Deep Cuts Only';
  return { score, label };
}

async function backfillImages(artists, tracks) {
  for (const artist of artists.slice(0, 10)) {
    if (hasRealImage(artist.image)) continue;
    try {
      const url  = `https://itunes.apple.com/search?term=${encodeURIComponent(artist.name)}&entity=album&limit=1`;
      const res  = await fetch(url);
      const data = await res.json();
      const img  = data.results?.[0]?.artworkUrl100;
      if (img) artist.image = itunesImgArray(img);
    } catch(e) {}
  }
  for (const track of tracks.slice(0, 10)) {
    if (hasRealImage(track.image)) continue;
    try {
      const query = `${track.artist.name} ${track.name}`;
      const url   = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
      const res   = await fetch(url);
      const data  = await res.json();
      const img   = data.results?.[0]?.artworkUrl100;
      if (img) track.image = itunesImgArray(img);
    } catch(e) {}
  }
}

async function getSampleTracks(allTracks) {
  let totalDuration = 0, validCount = 0;
  for (let i = 0; i < allTracks.length; i++) {
    let shouldSample = false;
    if (i < 50)       shouldSample = true;
    else if (i < 150) shouldSample = (i % 10 === 0);
    else              shouldSample = (i % 25 === 0);
    if (shouldSample) {
      try {
        const track = allTracks[i];
        const url   = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${API_KEY}&artist=${encodeURIComponent(track.artist.name)}&track=${encodeURIComponent(track.name)}&format=json`;
        const res   = await fetch(url);
        const data  = await res.json();
        const len   = parseInt(data?.track?.duration) || 0;
        if (len !== 0) { validCount++; totalDuration += len / 1000; }
      } catch (e) {}
    }
  }
  return { totalDuration, validCount };
}

async function fetchData(username) {
  try {
    const parseNum = document.getElementById('limitInput').value;
    const period   = document.getElementById('periodInput').value;

    logStatus(`Starting fetch for: ${username}`);
    setProgress(5);

    const infoRes  = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${username}&api_key=${API_KEY}&format=json`);
    const infoData = await infoRes.json();
    if (infoData.error) throw new Error(infoData.message);
    logStatus(`Profile loaded`);
    setProgress(15);

    logStatus('Fetching top artists...');
    const artistResult = await fetchAllPages('user.gettopartists', username, parseNum, period);
    setProgress(30);

    logStatus('Fetching top albums...');
    const albumResult = await fetchAllPages('user.gettopalbums', username, parseNum, period);
    setProgress(45);

    logStatus('Fetching top tracks...');
    const trackResult = await fetchAllPages('user.gettoptracks', username, parseNum, period);
    setProgress(60);

    logStatus('Analyzing active timestamps...');
    const recentRes    = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${API_KEY}&limit=200&format=json`);
    const recentData   = await recentRes.json();
    const recentTracks = recentData.recenttracks?.track || [];
    setProgress(68);

    let totalScrobbles = 0;
    if (period === 'overall') {
      totalScrobbles = parseInt(infoData.user.playcount);
    } else {
      const nowUnix    = Math.floor(Date.now() / 1000);
      const secondsMap = { '7day': 7*86400, '1month': 30*86400, '3month': 90*86400, '6month': 180*86400, '12month': 365*86400 };
      const fromTs     = nowUnix - secondsMap[period];
      const totalRes   = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${API_KEY}&limit=1&from=${fromTs}&format=json`);
      const totalData  = await totalRes.json();
      totalScrobbles   = parseInt(totalData.recenttracks['@attr'].total);
    }
    logStatus(`Global scrobbles for this period: ${totalScrobbles.toLocaleString()}`);

    logStatus('Calculating Listening Age...');
    const listenAgeData = await calculateListeningAge(albumResult.data);
    setProgress(76);

    logStatus('Sampling track durations...');
    const tracklengths = await getSampleTracks(trackResult.data);
    setProgress(82);

    logStatus('Analyzing genre profile...');
    const genreMap = await fetchGenreMap(artistResult.data, 8);
    const topGenre = Object.entries(genreMap).sort((a,b) => b[1]-a[1])[0]?.[0] || 'Unknown';
    setProgress(88);

    logStatus('Scoring mainstream index...');
    const mainstreamData = await fetchMainstreamScore(artistResult.data);
    setProgress(93);

    logStatus('Fetching artist & track artwork...');
    await backfillImages(artistResult.data, trackResult.data);
    setProgress(100);

    return {
      user: username,
      totalScrobbles,
      topGenre,
      genreMap,
      listenAgeData,
      recentTracks,
      mainstreamData,
      joinedUnix: parseInt(infoData.user.registered['#text']),
      period,
      artists: artistResult.data,
      totalUniqueArtists: artistResult.total,
      albums:  albumResult.data,
      totalUniqueAlbums:  albumResult.total,
      tracks:  trackResult.data,
      totalUniqueTracks:  trackResult.total,
      durations: tracklengths,
    };
  } catch (error) {
    logStatus(`Error: ${error.message}`);
    alert(`Error fetching data: ${error.message}`);
    location.reload();
  }
}

// ─── STATS ──────────────────────────────────────────────────────────────────
function calculateStats(data) {
  logStatus('Calculating statistics...');
  setProgress(99);

  const periodDays = {
    '7day': 7, '1month': 30, '3month': 90, '6month': 180, '12month': 365,
    'overall': Math.max(1, (Math.floor(Date.now() / 1000) - data.joinedUnix) / 86400)
  };
  const daysActive = Math.max(1, periodDays[data.period] ?? ((Math.floor(Date.now() / 1000) - data.joinedUnix) / 86400));

  let avgSongSec = 210;
  if (data.durations.validCount > 0) avgSongSec = data.durations.totalDuration / data.durations.validCount;

  const totalSec     = data.totalScrobbles * avgSongSec;
  const totalHours   = Math.round(totalSec / 3600).toLocaleString();
  const dailyMinutes = Math.round((totalSec / 60) / daysActive);
  const trackReplay  = (data.totalScrobbles / Math.max(1, data.totalUniqueTracks)).toFixed(2);
  const artistReplay = (data.totalScrobbles / Math.max(1, data.totalUniqueArtists)).toFixed(2);
  const albumReplay  = (data.totalScrobbles / Math.max(1, data.totalUniqueAlbums)).toFixed(2);

  let topArtistPct = '0', obsessionIndex = '0';
  if (data.artists.length > 0 && data.totalScrobbles > 0)
    topArtistPct   = ((parseInt(data.artists[0].playcount) / data.totalScrobbles) * 100).toFixed(1);
  if (data.tracks.length > 0 && data.totalScrobbles > 0)
    obsessionIndex = ((parseInt(data.tracks[0].playcount) / data.totalScrobbles) * 100).toFixed(1);

  const scrobblesPerDay = (data.totalScrobbles / daysActive).toFixed(1);

  const hourCounts = new Array(24).fill(0);
  data.recentTracks.forEach(t => {
    if (t.date?.uts) hourCounts[new Date(parseInt(t.date.uts) * 1000).getHours()]++;
  });
  const peakHourVal = hourCounts.indexOf(Math.max(...hourCounts));
  let peakStr = "Unknown";
  if (Math.max(...hourCounts) > 0) {
    const ampm = peakHourVal >= 12 ? 'PM' : 'AM';
    let fh = peakHourVal % 12; if (fh === 0) fh = 12;
    peakStr = `${fh} ${ampm}`;
  }

  const nightSc   = [22,23,0,1,2,3].reduce((s,h) => s + hourCounts[h], 0);
  const morningSc = [5,6,7,8,9,10].reduce((s,h) => s + hourCounts[h], 0);
  let nightOwlLabel = '🌆 Night-leaning';
  if      (nightSc > morningSc * 2)  nightOwlLabel = '🌙 Night Owl';
  else if (morningSc > nightSc * 2)  nightOwlLabel = '☀️ Early Bird';
  else if (morningSc > nightSc)      nightOwlLabel = '🌅 Morning-leaning';

  const rawDiv = data.totalUniqueArtists / Math.max(1, data.totalScrobbles);
  const diversityScore = Math.min(100, Math.round(Math.sqrt(rawDiv) * 1000));
  let diversityLabel = 'Curated';
  if      (diversityScore >= 70) diversityLabel = 'Omnivore';
  else if (diversityScore >= 45) diversityLabel = 'Eclectic';
  else if (diversityScore >= 25) diversityLabel = 'Curated';
  else if (diversityScore >= 10) diversityLabel = 'Loyal';
  else                           diversityLabel = 'Devotee';

  setProgress(100);
  logStatus('Done! Rendering results.');

  return {
    username: data.user,
    totalHours, dailyMinutes,
    avgSongMins: (avgSongSec / 60).toFixed(2),
    trackReplay, artistReplay, albumReplay,
    topArtistPct, scrobblesPerDay,
    topGenre:      data.topGenre,
    genreMap:      data.genreMap,
    listenAge:     data.listenAgeData.avgYear,
    listenEra:     data.listenAgeData.generation,
    obsessionIndex, peakHour: peakStr, nightOwlLabel,
    diversityScore, diversityLabel,
    topAlbum:  data.albums.length  > 0 ? data.albums[0].name  : 'None',
    topArtist: data.artists.length > 0 ? data.artists[0].name : 'None',
    topTrack:  data.tracks.length  > 0 ? data.tracks[0].name  : 'None',
    mainstream: data.mainstreamData,
  };
}

// ─── COMPATIBILITY CALCULATION ────────────────────────────────────────────────
async function calculateCompatibility(user1Data, user2Data) {
  const SAMPLE = 100;
  const u1Artists = user1Data.artists.slice(0, SAMPLE);
  const u2Artists = user2Data.artists.slice(0, SAMPLE);

  const u1Max = parseInt(u1Artists[0]?.playcount || 1);
  const u2Max = parseInt(u2Artists[0]?.playcount || 1);
  const u1Map = new Map(u1Artists.map(a => [a.name.toLowerCase(), parseInt(a.playcount) / u1Max]));
  const u2Map = new Map(u2Artists.map(a => [a.name.toLowerCase(), parseInt(a.playcount) / u2Max]));

  const allU1Names  = new Set(u1Map.keys());
  const allU2Names  = new Set(u2Map.keys());
  const sharedNames = [...allU1Names].filter(n => allU2Names.has(n));
  const onlyU1Names = [...allU1Names].filter(n => !allU2Names.has(n));
  const onlyU2Names = [...allU2Names].filter(n => !allU1Names.has(n));

  // Artist cosine similarity
  let dot = 0, mag1 = 0, mag2 = 0;
  for (const [name, v1] of u1Map) {
    mag1 += v1 * v1;
    if (u2Map.has(name)) dot += v1 * u2Map.get(name);
  }
  for (const [, v2] of u2Map) mag2 += v2 * v2;
  const artistScore = Math.round((dot / (Math.sqrt(mag1) * Math.sqrt(mag2) || 1)) * 100);

  // Genre cosine similarity
  logStatus('Comparing genre fingerprints...');
  const [g1, g2] = await Promise.all([
    fetchGenreMap(u1Artists, 10),
    fetchGenreMap(u2Artists, 10),
  ]);

  const allGenreKeys = new Set([...Object.keys(g1), ...Object.keys(g2)]);
  const sharedGenres = [...Object.keys(g1)].filter(g => g2[g]);
  let gDot = 0, gMag1 = 0, gMag2 = 0;
  for (const g of allGenreKeys) {
    const v1 = g1[g] || 0, v2 = g2[g] || 0;
    gDot += v1 * v2; gMag1 += v1 * v1; gMag2 += v2 * v2;
  }
  const genreScore = Math.round((gDot / (Math.sqrt(gMag1) * Math.sqrt(gMag2) || 1)) * 100);

  // Era proximity
  const era1     = user1Data.listenAgeData?.avgYear || 2010;
  const era2     = user2Data.listenAgeData?.avgYear || 2010;
  const eraDiff  = Math.abs(era1 - era2);
  const eraScore = Math.max(0, Math.round(100 - (eraDiff / 20) * 100));

  // Blended score
  const score = Math.min(100, Math.max(0, Math.round(artistScore * 0.60 + genreScore * 0.30 + eraScore * 0.10)));

  let ratingClass = 'low', ratingLabel = 'Low Match';
  if      (score >= 75) { ratingClass = 'super';  ratingLabel = 'Super Match!'; }
  else if (score >= 50) { ratingClass = 'high';   ratingLabel = 'High Match'; }
  else if (score >= 25) { ratingClass = 'medium'; ratingLabel = 'Medium Match'; }

  const sharedArtists = sharedNames.map(name => {
    const orig = u1Artists.find(a => a.name.toLowerCase() === name);
    return {
      name: orig?.name || name, image: orig?.image || [],
      u1Plays: Math.round(u1Map.get(name) * u1Max),
      u2Plays: Math.round(u2Map.get(name) * u2Max),
      totalScore: u1Map.get(name) + u2Map.get(name),
    };
  }).sort((a, b) => b.totalScore - a.totalScore);

  const onlyU1 = onlyU1Names.map(name => {
    const a = u1Artists.find(a => a.name.toLowerCase() === name);
    return { name: a?.name || name, image: a?.image || [], playcount: Math.round(u1Map.get(name) * u1Max) };
  }).sort((a, b) => b.playcount - a.playcount);

  const onlyU2 = onlyU2Names.map(name => {
    const a = u2Artists.find(a => a.name.toLowerCase() === name);
    return { name: a?.name || name, image: a?.image || [], playcount: Math.round(u2Map.get(name) * u2Max) };
  }).sort((a, b) => b.playcount - a.playcount);

  // Bridge Artist: artist that u1 loves (>15% of top), u2 doesn't have, ideally in a shared genre
  const u2GenreSet = new Set(Object.keys(g2));
  const bridgeCandidates = onlyU1
    .filter(a => u1Map.get(a.name.toLowerCase()) > 0.15)
    .sort((a, b) => b.playcount - a.playcount);
  const bridge = bridgeCandidates[0] || onlyU1[0] || null;

  const verdicts = {
    low:    ["You two orbit different musical galaxies — but hey, opposites can vibe.", "Your playlists are strangers. A collab session could be genuinely wild.", "Very little overlap, but your taste gap might make for great recommendations."],
    medium: ["Some shared ground — enough to queue up a decent joint playlist.", "You've got a real overlap going. A few shared artists to build on.", "Not twins, but definitely cousins. Room to grow."],
    high:   ["Solid compatibility. You two clearly run in the same sonic circles.", "High overlap — expect a lot of 'wait you listen to them too?' moments.", "Your music taste is suspiciously similar. Were you separated at birth?"],
    super:  ["Almost identical taste. You're basically the same person with different usernames.", "Extraordinary match. Your Last.FM libraries could be mistaken for each other.", "Super compatible. You could swap headphones and not even notice."],
  };
  const verdict      = verdicts[ratingClass][Math.floor(Math.random() * verdicts[ratingClass].length)];
  const verdictEmoji = { low: '🎲', medium: '🎸', high: '🔥', super: '🌟' }[ratingClass];
  const overlapPct   = allGenreKeys.size > 0 ? Math.round((sharedGenres.length / allGenreKeys.size) * 100) + '%' : '—';

  return {
    score, artistScore, genreScore, eraScore,
    ratingClass, ratingLabel, verdict, verdictEmoji,
    sharedArtists, onlyU1, onlyU2, bridge,
    sharedCount: sharedNames.length,
    onlyU1Count: onlyU1Names.length,
    onlyU2Count: onlyU2Names.length,
    genreOverlap: overlapPct,
    g1, g2, era1, era2, eraDiff,
  };
}

// ─── DISPLAY HELPERS ────────────────────────────────────────────────────────
function buildList(items, container, type = 'artist') {
  const maxPlays = items.length > 0 ? parseInt(items[0].playcount) : 1;
  container.innerHTML = '';
  items.slice(0, 10).forEach((item, i) => {
    const imgUrl   = bestImg(item.image);
    const rank     = i + 1;
    const plays    = parseInt(item.playcount);
    const barWidth = Math.round((plays / maxPlays) * 100);
    const name     = item.name;
    const sub      = (type === 'track' && item.artist?.name) ? item.artist.name : '';
    let rankClass  = '';
    if (rank === 1) rankClass = 'gold'; else if (rank === 2) rankClass = 'silver'; else if (rank === 3) rankClass = 'bronze';
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="rank-num ${rankClass}">${rank}</span>
      <img src="${imgUrl}" class="list-thumb" alt="" onerror="this.src='${BLANK_IMG}'">
      <span class="rank-name" title="${name}">${name}${sub ? `<span class="rank-sub">${sub}</span>` : ''}</span>
      <div class="rank-bar-wrap"><div class="rank-bar" style="width:${barWidth}%"></div></div>
      <span class="rank-plays">${plays.toLocaleString()}</span>
    `;
    container.appendChild(li);
  });
}

function buildSimpleList(items, container) {
  if (!container) return;
  container.innerHTML = '';
  const maxPlays = items.length > 0 ? items[0].playcount : 1;
  items.forEach((item, i) => {
    const rank = i + 1;
    let rankClass = '';
    if (rank === 1) rankClass = 'gold'; else if (rank === 2) rankClass = 'silver'; else if (rank === 3) rankClass = 'bronze';
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="rank-num ${rankClass}">${rank}</span>
      <img src="${bestImg(item.image)}" class="list-thumb" alt="" onerror="this.src='${BLANK_IMG}'">
      <span class="rank-name" title="${item.name}">${item.name}</span>
      <div class="rank-bar-wrap"><div class="rank-bar" style="width:${Math.round((item.playcount / maxPlays) * 100)}%"></div></div>
      <span class="rank-plays">${item.playcount.toLocaleString()}</span>
    `;
    container.appendChild(li);
  });
}

// ─── GENRE CLOUD ─────────────────────────────────────────────────────────────
// ─── GENRE CLOUD ─────────────────────────────────────────────────────────────
function renderGenreCloud(genreMap) {
  const wrap = document.getElementById('genre-cloud');
  if (!wrap) return;
  wrap.innerHTML = '';

  const entries = Object.entries(genreMap).sort((a, b) => b[1] - a[1]).slice(0, 14);
  if (!entries.length) return;

  const max    = entries[0][1];
  const colors = ['#e8473f','#5b8dee','#3ecf8e','#d4a030','#c084fc','#fb923c','#38bdf8','#f472b6'];
  const W      = wrap.clientWidth || 760;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '160');
  svg.setAttribute('viewBox', `0 0 ${W} 160`);

  const padding = 8;
  let x = padding, y = 0, rowH = 0;

  entries.forEach(([tag, weight], i) => {
    const ratio = weight / max;
    const r     = Math.round(18 + ratio * 38);
    const color = colors[i % colors.length];
    const alpha = 0.18 + ratio * 0.22;

    if (x + r * 2 + padding > W && x > padding) {
      x = padding; y += rowH + padding; rowH = 0;
    }
    rowH = Math.max(rowH, r * 2);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x + r);
    circle.setAttribute('cy', y + r + padding);
    circle.setAttribute('r', r);
    circle.setAttribute('fill', color);
    circle.setAttribute('fill-opacity', alpha);
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-opacity', 0.5);
    circle.setAttribute('stroke-width', 1);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x + r);
    text.setAttribute('y', y + r + padding + 1);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('fill', color);
    text.setAttribute('fill-opacity', 0.9);
    text.setAttribute('font-family', "'DM Mono', monospace");
    text.setAttribute('letter-spacing', '0.04em');

    // Font size: fit to circle, accounting for text length
    const maxFontSize  = Math.max(8, Math.round(7 + ratio * 7));
    const fitFontSize  = Math.min(maxFontSize, Math.floor((r * 1.6) / Math.max(tag.length, 1) * 2.2));
    const finalSize    = Math.max(7, fitFontSize);
    text.setAttribute('font-size', finalSize);

    // Word-wrap: split two-word tags onto two lines if they'd overflow
    const words = tag.split(' ');
    if (words.length > 1 && finalSize < 11) {
      const mid = Math.ceil(words.length / 2);
      const t1  = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      t1.setAttribute('x', x + r);
      t1.setAttribute('dy', '-0.5em');
      t1.textContent = words.slice(0, mid).join(' ');
      const t2 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      t2.setAttribute('x', x + r);
      t2.setAttribute('dy', '1.2em');
      t2.textContent = words.slice(mid).join(' ');
      text.appendChild(t1);
      text.appendChild(t2);
    } else {
      text.textContent = tag;
    }

    g.appendChild(circle);
    g.appendChild(text);
    svg.appendChild(g);

    x += r * 2 + padding;
  });

  const finalH = y + rowH + padding * 3;
  svg.setAttribute('height', finalH);
  svg.setAttribute('viewBox', `0 0 ${W} ${finalH}`);

  wrap.appendChild(svg);
}

// ─── GENRE FINGERPRINT (compat) ───────────────────────────────────────────────
function renderGenreFingerprint(g1Map, g2Map, user1Name, user2Name) {
  const grid = document.getElementById('comp-genre-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const allGenres = new Set([...Object.keys(g1Map), ...Object.keys(g2Map)]);
  const ranked = [...allGenres]
    .map(g => ({ name: g, score: (g1Map[g] || 0) + (g2Map[g] || 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const maxG1 = Math.max(...ranked.map(g => g1Map[g.name] || 0), 1);
  const maxG2 = Math.max(...ranked.map(g => g2Map[g.name] || 0), 1);

  const legend = document.createElement('div');
  legend.className = 'genre-legend';
  legend.innerHTML = `
    <div class="genre-legend-item"><div class="legend-dot legend-dot--u1"></div><span>${user1Name}</span></div>
    <div class="genre-legend-item"><div class="legend-dot legend-dot--u2"></div><span>${user2Name}</span></div>
  `;
  grid.appendChild(legend);

  ranked.forEach((genre, idx) => {
    const u1Pct = Math.round(((g1Map[genre.name] || 0) / maxG1) * 100);
    const u2Pct = Math.round(((g2Map[genre.name] || 0) / maxG2) * 100);
    const row = document.createElement('div');
    row.className = 'genre-row';
    row.style.animationDelay = `${idx * 0.05}s`;
    row.innerHTML = `
      <span class="genre-row-name" title="${genre.name}">${genre.name}</span>
      <div class="genre-bar-wrap genre-bar-wrap--u1"><div class="genre-bar-u1" style="width:0%"></div></div>
      <div class="genre-bar-wrap genre-bar-wrap--u2"><div class="genre-bar-u2" style="width:0%"></div></div>
    `;
    grid.appendChild(row);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      row.querySelector('.genre-bar-u1').style.width = u1Pct + '%';
      row.querySelector('.genre-bar-u2').style.width = u2Pct + '%';
    }));
  });
}

// ─── DISPLAY — SINGLE USER ───────────────────────────────────────────────────
function displayResults(stats, rawData) {
  const specialMsg = easterEggs(stats);

  const genreName = stats.topGenre;
  resGenre.textContent = genreName;
  if      (genreName.length > 15) resGenre.style.fontSize = '1.1rem';
  else if (genreName.length > 9)  resGenre.style.fontSize = '1.4rem';
  resGenre.nextElementSibling.innerHTML = `<span class="genre-badge">Sonic DNA</span>`;

  resVerdict.textContent      = specialMsg || "";
  resUsername.textContent     = stats.username;
  resDaily.textContent        = stats.dailyMinutes;
  resTrackReplay.textContent  = stats.trackReplay + 'x';
  resArtistReplay.textContent = stats.artistReplay + 'x';
  resAvgSong.textContent      = stats.avgSongMins;
  resAlbumReplay.textContent  = stats.albumReplay + 'x';
  resTopArtistPct.textContent = stats.topArtistPct + '%';
  resScrobblesDay.textContent = stats.scrobblesPerDay;
  resListenAge.textContent    = stats.listenAge;
  resListenEra.textContent    = stats.listenEra;
  resPeakHour.textContent     = stats.peakHour;
  resObsession.textContent    = stats.obsessionIndex + '%';

  set('res-total-hours', stats.totalHours + 'h');
  set('res-diversity',   stats.diversityScore);
  set('res-night-owl',   stats.nightOwlLabel);
  set('res-mainstream',  stats.mainstream.label);

  const msCard  = document.getElementById('res-mainstream')?.closest('.stat-card');
  if (msCard)  { const sub = msCard.querySelector('.stat-sub');  if (sub)  sub.textContent = stats.mainstream.score + '% mainstream score'; }
  const divCard = document.getElementById('res-diversity')?.closest('.stat-card');
  if (divCard) { const sub = divCard.querySelector('.stat-sub'); if (sub) sub.textContent = stats.diversityLabel; }

  // Genre cloud
  renderGenreCloud(stats.genreMap || {});

  // Promo ad
  const discography = [
    { title: "One Lane Road",                    url: "https://open.spotify.com/album/5070PDjUNXiU9pSKiz728m?si=9Gs9vC55TOmFtu0LLOUSIA",  image: "https://unchainedmusic.s3.us-west-1.wasabisys.com/65d01f7cffcfc440423051cb/release/6659a9002f8e5f22cf678273/ReleasePreviewCover/2024-05-31T10%3A40%3A47.773Z2024-05-31T10%3A40%3A47.773Z7dcf458a18eee240ec2acb962f58e745.png" },
    { title: "One Last Beginning",               url: "https://open.spotify.com/album/3oLFisvLckdEbdvIrelsnH?si=IiNvRzKhS2CrLFYyAq2Liw",  image: "https://unchainedmusic.s3.us-west-1.wasabisys.com/65d01f7cffcfc440423051cb/release/6659a9002f8e5f22cf678273/ReleasePreviewCover/2024-05-31T10%3A40%3A47.773Z2024-05-31T10%3A40%3A47.773Z7dcf458a18eee240ec2acb962f58e745.png" },
    { title: "Bersache",                         url: "https://open.spotify.com/album/54wevKhcKFYarKCRnNI2e8?si=dTOtze6aTxeiymGv52XATQ",  image: "https://unchainedmusic.s3.us-west-1.wasabisys.com/65d01f7cffcfc440423051cb/release/6910cfe55b4bd45fa61382bf/ReleasePreviewCover/2025-11-20T03%3A10%3A19.902Z2025-11-20T03%3A10%3A19.902Z81669b60fdd9dc99eb906209e4babd55.png" },
    { title: "Drift Devil MK1",                  url: "https://open.spotify.com/album/7zvPn2Yso9vY6gQUNA2W7p?si=M5URZXDSQHqW_bDaMLqV5g",  image: "https://unchainedmusic.s3.us-west-1.wasabisys.com/65d01f7cffcfc440423051cb/release/f816a2bef247607a41306857/ReleasePreviewCover/2024-05-10T09%3A41%3A59.034Z2024-05-10T09%3A41%3A59.034Z26ec413074f971e9c0e4d58826787261.png" },
    { title: "Falling in Love (Ready for This)", url: "https://open.spotify.com/album/5zll4T5hKBqq5LlDtDVHoM?si=8g7q3RFqRLePkcUTZ7ueig",  image: "https://unchainedmusic.s3.us-west-1.wasabisys.com/65d01f7cffcfc440423051cb/release/6659a9002f8e5f22cf678273/ReleasePreviewCover/2024-05-31T10%3A40%3A47.773Z2024-05-31T10%3A40%3A47.773Z7dcf458a18eee240ec2acb962f58e745.png" },
    { title: "badly made breakcore",             url: "https://open.spotify.com/album/6bJGF9ghPUoTrtGEww5xiT?si=v6WMzr3CRwGRSpcJhRDj0A",  image: "https://unchainedmusic.s3.us-west-1.wasabisys.com/65d01f7cffcfc440423051cb/release/66cc97c0ca5a6d91638744df/ReleasePreviewCover/2024-08-26T14%3A57%3A12.566Z2024-08-26T14%3A57%3A12.566Zed33910a2703a3f64e2532bd0473f6bc.png" },
    { title: "heavenly",                         url: "https://open.spotify.com/album/4rhSz5Ya43gCQWb3KzcYUc?si=LdTzpmc5TPCD15RppbRRRg",  image: "https://unchainedmusic.s3.us-west-1.wasabisys.com/65d01f7cffcfc440423051cb/release/17794d370025dc2f21356630/ReleasePreviewCover/2024-04-03T13%3A56%3A00.684Z2024-04-03T13%3A56%3A00.684Za917abc569348f66beaae3d7d7085ac7.jpg" },
    { title: "Tokyo Sniper",                     url: "https://open.spotify.com/album/56nCwN7SrzfzWmGgz9k0l2?si=u4XZxtGsRnSs0Nt0pnK5xA",  image: "https://unchainedmusic.s3.us-west-1.wasabisys.com/65d01f7cffcfc440423051cb/release/67b985714373104a0e4a4559/ReleasePreviewCover/2024-02-17T02%3A59%3A44.009Z2024-02-17T02%3A59%3A44.009Z4840483c1aae0978ad1896ff180fcf53.jpg" }
  ];
  const rs = discography[Math.floor(Math.random() * discography.length)];
  adSlot.innerHTML = `
    <span class="ad-label">Official Sponsor</span>
    <img src="${rs.image}" class="ad-artwork" alt="Artwork">
    <span class="song-title">"${rs.title}"</span>
    <a href="${rs.url}" target="_blank" class="promo-cta">Listen outsidehere ↗</a>
  `;

  buildList(rawData.artists, resArtists, 'artist');
  buildList(rawData.tracks,  resTracks,  'track');
  const resAlbumsEl = document.getElementById('res-albums');
  if (resAlbumsEl) buildList(rawData.albums, resAlbumsEl, 'album');

  // Share button
  document.getElementById('shareBtn')?.addEventListener('click', () => sharePulseCard(stats, rawData));

  loadingView.classList.add('hidden');
  resultsView.classList.remove('hidden');
}

// ─── DISPLAY — COMPATIBILITY ──────────────────────────────────────────────────
function displayCompatibility(user1Data, user2Data, compData) {
  logStatus('Building compatibility page...');

  set('comp-user1',            user1Data.user);
  set('comp-user2',            user2Data.user);
  set('comp-user1-scrobbles',  `${user1Data.totalScrobbles.toLocaleString()} scrobbles`);
  set('comp-user2-scrobbles',  `${user2Data.totalScrobbles.toLocaleString()} scrobbles`);
  set('comp-score',            compData.score + '%');
  set('comp-shared-count',     compData.sharedCount);
  set('comp-unique-u1',        compData.onlyU1Count);
  set('comp-unique-u2',        compData.onlyU2Count);
  set('comp-genre-overlap',    compData.genreOverlap);
  set('comp-unique-u1-lbl',    `only ${user1Data.user} listens to`);
  set('comp-unique-u2-lbl',    `only ${user2Data.user} listens to`);
  set('comp-verdict-text',     compData.verdict);
  set('comp-diverge-u1-title', `${user1Data.user}'s Exclusives`);
  set('comp-diverge-u2-title', `${user2Data.user}'s Exclusives`);

  const ratingBadge = document.getElementById('comp-rating-badge');
  if (ratingBadge) { ratingBadge.textContent = compData.ratingLabel; ratingBadge.className = `compat-rating-badge ${compData.ratingClass}`; }

  const verdictIcon = document.querySelector('.compat-verdict-icon');
  if (verdictIcon) verdictIcon.textContent = compData.verdictEmoji;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const fill = document.getElementById('comp-meter-fill');
    if (fill) { fill.className = `compat-meter-fill ${compData.ratingClass}`; fill.style.width = compData.score + '%'; }
  }));

  const breakdown = document.getElementById('comp-score-breakdown');
  if (breakdown) {
    breakdown.innerHTML = `
      <div class="score-chip"><span class="score-chip-val">${compData.artistScore}%</span><span class="score-chip-lbl">artist vectors</span></div>
      <div class="score-chip"><span class="score-chip-val">${compData.genreScore}%</span><span class="score-chip-lbl">genre match</span></div>
      <div class="score-chip"><span class="score-chip-val">${compData.eraScore}%</span><span class="score-chip-lbl">era proximity</span></div>
    `;
  }

  const eraEl = document.getElementById('comp-era-compare');
  if (eraEl) {
    eraEl.textContent = compData.eraDiff === 0
      ? `Both vibe in ${compData.era1}`
      : `${user1Data.user}: ~${compData.era1} · ${user2Data.user}: ~${compData.era2}`;
  }

  const u1Sc = user1Data.totalScrobbles, u2Sc = user2Data.totalScrobbles;
  const u1Pct = Math.round((u1Sc / (u1Sc + u2Sc)) * 100);
  const moreBar = document.getElementById('comp-more-bar');
  if (moreBar) {
    moreBar.innerHTML = `
      <div class="more-bar-label">
        <span style="color:var(--red)">${user1Data.user}</span>
        <span style="color:var(--text-mute);font-size:0.6rem;text-transform:uppercase;letter-spacing:0.08em">who listens more</span>
        <span style="color:#5b8dee">${user2Data.user}</span>
      </div>
      <div class="more-bar-track">
        <div class="more-bar-u1" style="width:${u1Pct}%"></div>
        <div class="more-bar-u2" style="width:${100 - u1Pct}%"></div>
      </div>
      <div class="more-bar-nums">
        <span>${u1Sc.toLocaleString()}</span>
        <span>${u2Sc.toLocaleString()}</span>
      </div>
    `;
  }

  // Bridge Artist
  const bridgePanel = document.getElementById('bridge-panel');
  if (compData.bridge && bridgePanel) {
    bridgePanel.classList.remove('hidden');
    document.getElementById('bridge-content').innerHTML = `
      <div class="bridge-artist">
        <img src="${bestImg(compData.bridge.image)}" class="bridge-img" alt="" onerror="this.src='${BLANK_IMG}'">
        <div class="bridge-info">
          <span class="bridge-name">${compData.bridge.name}</span>
          <span class="bridge-intro-label">${user1Data.user} should introduce ${user2Data.user} to this one</span>
          <span class="bridge-desc">${compData.bridge.playcount?.toLocaleString() || compData.bridge.u1Plays?.toLocaleString() || '—'} plays on ${user1Data.user}'s end — and ${user2Data.user} hasn't heard a thing.</span>
        </div>
      </div>
    `;
  }

  // Shared artists
  set('comp-shared-panel-count', compData.sharedArtists.length);
  const sharedList = document.getElementById('comp-shared-list');
  if (sharedList) {
    sharedList.innerHTML = '';
    compData.sharedArtists.slice(0, 10).forEach((artist, i) => {
      const rank = i + 1;
      let rankClass = '';
      if (rank === 1) rankClass = 'gold'; else if (rank === 2) rankClass = 'silver'; else if (rank === 3) rankClass = 'bronze';
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="rank-num ${rankClass}">${rank}</span>
        <img src="${bestImg(artist.image)}" class="list-thumb" alt="" onerror="this.src='${BLANK_IMG}'">
        <span class="rank-name" title="${artist.name}">${artist.name}</span>
        <div class="rank-bar-wrap"><div class="rank-bar" style="width:60%"></div></div>
        <div class="compat-plays-pair">
          <span class="compat-plays-u1">${artist.u1Plays.toLocaleString()}</span>
          <span class="compat-plays-u2">${artist.u2Plays.toLocaleString()}</span>
        </div>
      `;
      sharedList.appendChild(li);
    });
  }

  buildSimpleList(compData.onlyU1.slice(0, 5), document.getElementById('comp-only-u1-list'));
  buildSimpleList(compData.onlyU2.slice(0, 5), document.getElementById('comp-only-u2-list'));
  renderGenreFingerprint(compData.g1, compData.g2, user1Data.user, user2Data.user);

  // Compat share
  document.getElementById('compatShareBtn')?.addEventListener('click', () =>
    shareCompatCard(user1Data, user2Data, compData)
  );

  setProgress(100);
  logStatus('Done!');
  loadingView.classList.add('hidden');
  compatView.classList.remove('hidden');
}

// ─── PULSE SHARE CARD ─────────────────────────────────────────────────────────
async function sharePulseCard(stats, rawData) {
  const btn = document.getElementById('shareBtn');
  if (btn) { btn.textContent = 'Rendering...'; btn.disabled = true; }

  const topArtists = rawData.artists.slice(0, 5).map(a => a.name).join(' · ');
  const topTracks  = rawData.tracks.slice(0, 3).map(t => t.name).join(' · ');
  const genreTags  = Object.entries(stats.genreMap || {})
    .sort((a,b) => b[1]-a[1]).slice(0,6).map(([t]) => t).join('  ');

  const card = document.getElementById('pulse-card');
  card.innerHTML = `
    <div class="pulse-bg"></div>
    <div class="pulse-inner">
      <div class="pulse-brand"><span class="pulse-dot"></span><span>outsidehere's Last.FM tool</span></div>
      <div class="pulse-username">${stats.username}</div>
      <div class="pulse-genre-line">${stats.topGenre}</div>
      <div class="pulse-tag-cloud">${genreTags}</div>
      <div class="pulse-stats-row">
        <div class="pulse-stat"><span class="pulse-stat-val">${stats.totalHours}h</span><span class="pulse-stat-lbl">listened</span></div>
        <div class="pulse-stat"><span class="pulse-stat-val">${stats.scrobblesPerDay}</span><span class="pulse-stat-lbl">tracks/day</span></div>
        <div class="pulse-stat"><span class="pulse-stat-val">${stats.listenAge}</span><span class="pulse-stat-lbl">avg era</span></div>
        <div class="pulse-stat"><span class="pulse-stat-val">${stats.mainstream.label}</span><span class="pulse-stat-lbl">taste</span></div>
      </div>
      <div class="pulse-divider"></div>
      <div class="pulse-section-label">top artists</div>
      <div class="pulse-artists">${topArtists}</div>
      <div class="pulse-section-label" style="margin-top:8px">top tracks</div>
      <div class="pulse-tracks">${topTracks}</div>
      <div class="pulse-footer">last.fm · outsidehere</div>
    </div>
  `;
  card.style.display = 'flex';

  try {
    const canvas = await html2canvas(card, { backgroundColor: '#0a0a0b', scale: 2, useCORS: true, logging: false });
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.download = `${stats.username}-pulse.png`;
      a.href = url; a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  } catch(e) { console.error('Share card failed:', e); }
  finally {
    card.style.display = 'none';
    if (btn) {
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M10 1a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM4 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" stroke="currentColor" stroke-width="1.3"/><path d="M5.8 6.3l2.4-1.6M5.8 7.7l2.4 1.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> Share Pulse`;
      btn.disabled = false;
    }
  }
}

async function shareCompatCard(user1Data, user2Data, compData) {
  const btn = document.getElementById('compatShareBtn');
  if (btn) { btn.textContent = 'Rendering...'; btn.disabled = true; }

  const card = document.getElementById('pulse-card');
  card.innerHTML = `
    <div class="pulse-bg pulse-bg--compat"></div>
    <div class="pulse-inner">
      <div class="pulse-brand"><span class="pulse-dot"></span><span>outsidehere's Last.FM tool</span></div>
      <div class="pulse-compat-vs">
        <span class="pulse-username">${user1Data.user}</span>
        <span class="pulse-vs-divider">vs</span>
        <span class="pulse-username">${user2Data.user}</span>
      </div>
      <div class="pulse-compat-score">${compData.score}%</div>
      <div class="pulse-compat-label">${compData.ratingLabel}</div>
      <div class="pulse-stats-row" style="margin-top:12px">
        <div class="pulse-stat"><span class="pulse-stat-val">${compData.sharedCount}</span><span class="pulse-stat-lbl">shared artists</span></div>
        <div class="pulse-stat"><span class="pulse-stat-val">${compData.genreOverlap}</span><span class="pulse-stat-lbl">genre overlap</span></div>
        <div class="pulse-stat"><span class="pulse-stat-val">${compData.artistScore}%</span><span class="pulse-stat-lbl">artist match</span></div>
        <div class="pulse-stat"><span class="pulse-stat-val">${compData.eraScore}%</span><span class="pulse-stat-lbl">era proximity</span></div>
      </div>
      <div class="pulse-divider"></div>
      <div class="pulse-verdict">"${compData.verdict}"</div>
      ${compData.bridge ? `<div class="pulse-bridge">🌉 Bridge artist: <strong>${compData.bridge.name}</strong></div>` : ''}
      <div class="pulse-footer">last.fm · outsidehere</div>
    </div>
  `;
  card.style.display = 'flex';

  try {
    const canvas = await html2canvas(card, { backgroundColor: '#0a0a0b', scale: 2, useCORS: true, logging: false });
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.download = `${user1Data.user}-x-${user2Data.user}-pulse.png`;
      a.href = url; a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  } catch(e) { console.error('Compat share failed:', e); }
  finally {
    card.style.display = 'none';
    if (btn) {
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M10 1a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM4 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" stroke="currentColor" stroke-width="1.3"/><path d="M5.8 6.3l2.4-1.6M5.8 7.7l2.4 1.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> Share Report`;
      btn.disabled = false;
    }
  }
}

// ─── EASTER EGGS ─────────────────────────────────────────────────────────────
function easterEggs(stats) {
  const u = stats.username.toLowerCase();
  if (u === 'legionz78')    return "Welcome back, Creator";
  if (u === 'susususu-idk') return "Welcome back, Co-driver";
  if (u === 'sa_paaa')      return "Welcome, SP";
  if (u === 'rusty-fox')    return "Welcome back, Stupid!";
  if (u === 'zuracaruz')    return "Welcome back da paithiyam :D!";
  return "";
}

// ─── KONAMI CODE ──────────────────────────────────────────────────────────────
const konamiCode = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let konamiIndex = 0;
document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase(), target = konamiCode[konamiIndex].toLowerCase();
  if (key === target) { konamiIndex++; if (konamiIndex === konamiCode.length) { activateFestivalMode(); konamiIndex = 0; } }
  else konamiIndex = 0;
});

function activateFestivalMode() {
  document.documentElement.style.setProperty('--red', '#d4a030');
  document.documentElement.style.setProperty('--red-glow', 'rgba(212,160,48,0.4)');
  logStatus("✨ SYSTEM: 'Platinum Edition unlocked. Dropping the beat...'");
  const emojis = ['🎵','🎶','🎸','🎹','🎷','🥁','🎧','📻','🎙️','💿','🔥'];
  for (let i = 0; i < 60; i++) {
    setTimeout(() => {
      const e = document.createElement('div');
      e.className = 'music-emoji';
      e.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      e.style.left = Math.random() * 100 + 'vw';
      e.style.animationDuration = (Math.random() * 2 + 2) + 's';
      e.style.fontSize = (Math.random() * 20 + 20) + 'px';
      document.body.appendChild(e);
      setTimeout(() => e.remove(), 4000);
    }, i * 80);
  }
}