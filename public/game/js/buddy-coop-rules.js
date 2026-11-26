// Bounded, authored co-op simulation. No model, network, pupil data or storage.
export const TEAM = {
  buddy: { name: 'Buddy', color: '#e8aa55', role: 'The encouraging builder' },
  nova: { name: 'Nova', color: '#a99edb', role: 'The thoughtful navigator' },
  pip: { name: 'Pip', color: '#78b9a0', role: 'The adventurous scout' },
};
export const PROFILES = [
  { version: 1, synthetic: true, classId: 'demo-class', learnerId: 'demo-alex', displayName: 'Alex', classCue: { activity: 'building a paper bridge', targetPhrase: 'Let’s build it together!' }, expiresOn: '2026-12-03' },
  { version: 1, synthetic: true, classId: 'demo-class', learnerId: 'demo-sam', displayName: 'Sam', classCue: { activity: 'drawing a star map', targetPhrase: 'Which way shall we go?' }, expiresOn: '2026-12-03' },
  { version: 1, synthetic: true, classId: 'demo-class', learnerId: 'demo-jo', displayName: 'Jo', classCue: { activity: 'making a picnic plan', targetPhrase: 'There is room for everyone!' }, expiresOn: '2026-12-03' },
];
// Only our exact synthetic fixtures are accepted. This is not an import surface
// for real classroom records. Expired profiles lose their classroom cue.
export function validProfile(profile, today = new Date().toISOString().slice(0, 10)) {
  return PROFILES.find(p => JSON.stringify(p) === JSON.stringify(profile) && p.expiresOn >= today) ?? null;
}
export const PLACES = {
  timber: { c: 2, r: 4, name: 'Timber grove' },
  bridge: { c: 6, r: 5, name: 'Old bridge' },
  switch: { c: 10, r: 5, name: 'Lantern switch' },
  beacon: { c: 12, r: 2, name: 'Star lantern' },
  picnic: { c: 12, r: 7, name: 'Picnic clearing' },
};
export const same = (a, b) => a.c === b.c && a.r === b.r;
export const distance = (a, b) => Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
export function land(c, r, built = false) {
  return (c >= 0 && c <= 6 && r >= 2 && r <= 9 && !(c < 2 && r > 8)) ||
    (c >= 9 && c <= 14 && r >= 0 && r <= 8 && !(c > 13 && r < 2)) ||
    (built && (c === 7 || c === 8) && r === 5);
}
export function findPath(from, to, built) {
  const queue = [[{ c: from.c, r: from.r }]], seen = new Set([`${from.c},${from.r}`]);
  while (queue.length) {
    const path = queue.shift(), current = path.at(-1);
    if (same(current, to)) return path.slice(1);
    for (const [dc, dr] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const next = { c: current.c + dc, r: current.r + dr }, key = `${next.c},${next.r}`;
      if (!seen.has(key) && land(next.c, next.r, built)) { seen.add(key); queue.push([...path, next]); }
    }
  }
  return [];
}
export function createAdventure({ profile = PROFILES[0], today, emit = () => {} } = {}) {
  const memory = validProfile(profile, today);
  const state = {
    name: memory?.displayName ?? 'Explorer', memory, started: false, paused: false,
    wood: false, built: false, building: false, goingToSwitch: false, holding: false, lit: false, complete: false,
    time: 0, moveClock: 0, buildClock: 0, path: [],
    player: { c: 3, r: 7 },
    actors: { buddy: { c: 4, r: 7 }, nova: { c: 3, r: 6 }, pip: { c: 5, r: 6 } },
  };
  const say = (who, text) => emit({ who, text });
  function start() {
    if (state.started) return;
    state.started = true;
    say('buddy', memory ? `Hey, ${state.name}! Remember ${memory.classCue.activity} in our pretend class? ${memory.classCue.targetPhrase}` : `Hey, ${state.name}! I’m Buddy. Come explore with our team!`);
    say('nova', 'The star lantern is dark. Shall we light it for a sunset picnic?');
    say('pip', 'I’m in! I’ll scout ahead. You and Buddy make a great building team.');
  }
  function walkTo(target) {
    if (!state.started || state.paused) return false;
    const path = findPath(state.player, target, state.built);
    if (!path.length && !same(state.player, target)) return false;
    state.path = path;
    return true;
  }
  function interact() {
    if (!state.started || state.paused || state.complete) return;
    if (!state.wood && distance(state.player, PLACES.timber) <= 1) {
      state.wood = true;
      say('buddy', 'Nice find! Those planks will fix the bridge. Ask me to build it with you.');
    } else if (!state.lit && distance(state.player, PLACES.beacon) <= 1) {
      if (!state.holding) return say('nova', 'The lantern needs power. Ask me to hold the switch while you light it.');
      state.lit = true;
      say('pip', 'Whoa! A whole sky of stars. Meet us at the picnic clearing!');
      say('buddy', `${state.name}, we did that together. Come sit with everyone!`);
    } else if (state.lit && distance(state.player, PLACES.picnic) <= 1) {
      state.complete = true;
      say('nova', 'One builder, one navigator, one scout, and you. There is room for everyone.');
      say('buddy', 'Same team, new adventure next time. Thanks for playing with us!');
    } else {
      say('pip', !state.wood ? 'See the little stack of planks? Walk to Timber grove, then collect them.' : !state.built ? 'Buddy is ready to help with the bridge. Try asking him!' : !state.lit ? 'Let’s go to the star lantern. Nova can keep its switch on.' : 'The picnic blanket is waiting for our whole team!');
    }
  }
  function send(raw) {
    if (!state.started || state.paused) return;
    const text = String(raw).trim().slice(0, 180);
    if (!text) return;
    say('you', text);
    const heard = text.normalize('NFKC').toLowerCase().replace(/[’]/g, "'");
    if (/\b(bridge|build|fix|planks?)\b/.test(heard)) {
      if (state.built) return say('buddy', 'Our bridge is ready. Everyone can cross!');
      if (state.building) return say('buddy', 'On it! Just fitting the last planks.');
      if (!state.wood) return say('buddy', 'Absolutely! Could you bring the planks from Timber grove?');
      state.building = true; state.buildClock = 0;
      say('buddy', 'You found the wood; I’ll do the building. Teamwork!');
      say('pip', 'I’ll check the far side when the bridge is safe.');
    } else if (/\b(switch|hold|power)\b/.test(heard)) {
      if (!state.built) return say('nova', 'I can hold it once we have a bridge to the other island.');
      if (state.holding) return say('nova', 'Still holding! You can go light the lantern.');
      if (state.goingToSwitch) return say('nova', 'On my way to the switch. I’ll tell you when it’s ready!');
      state.goingToSwitch = true;
      say('nova', 'Good plan. I’m walking over to the switch now!');
    } else if (/\b(remember|class|name)\b/.test(heard)) {
      say('buddy', memory ? `Of course, ${state.name}. In our pretend class we were ${memory.classCue.activity}. You said, “${memory.classCue.targetPhrase}”` : `You’re ${state.name}. We’re making new memories on this island today!`);
    } else if (/\b(hi|hello|hey)\b/.test(heard)) {
      say('buddy', `Hey, ${state.name}! Happy you’re here.`); say('pip', 'Hello from the scouting department! Ready to explore?');
    } else if (/\b(scared|afraid|hard|can't|cannot|worried)\b/.test(heard)) {
      say('nova', 'We can go slowly. You can ask the whole team for help, or take a break.');
    } else if (/\b(thank|thanks|great|nice)\b/.test(heard)) {
      say('buddy', 'Thanks, teammate! Everyone brought something to this adventure.');
    } else if (/\b(picnic|food|hungry)\b/.test(heard)) {
      say('pip', 'I packed imaginary apple sandwiches. Nova says that’s just two apples. Fair point.');
      say('nova', 'Still an excellent picnic. Let’s invite the whole team.');
    } else if (/\b(help|where|what|how)\b/.test(heard)) {
      say('nova', !state.wood ? 'First, find the planks at Timber grove. Walk over and collect them.' : !state.built ? 'Ask Buddy: “Can you build the bridge?”' : !state.holding ? 'Ask me: “Nova, hold the switch.” Then walk to the star lantern.' : !state.lit ? 'Walk to Star lantern and press the action button. I’m holding the switch!' : 'Meet everyone at Picnic clearing. Press the action button to sit with us.');
    } else {
      say('buddy', 'I’m a scripted demo teammate, so I don’t understand everything yet. Try “remember our class”, “help”, or ask about the bridge, switch, or picnic.');
    }
  }
  function tick(dt) {
    if (!state.started || state.paused) return;
    dt = Math.max(0, Math.min(dt, .1)); state.time += dt; state.moveClock += dt;
    if (state.moveClock >= .16) {
      state.moveClock = 0;
      const next = state.path.shift();
      if (next) {
        const previous = { ...state.player }; state.player = next;
        const oldBuddy = { ...state.actors.buddy }, oldPip = { ...state.actors.pip };
        if (!state.building) state.actors.buddy = previous;
        if (!state.holding && !state.goingToSwitch) state.actors.nova = oldPip;
        state.actors.pip = state.building ? previous : oldBuddy;
      }
    }
    if (state.building) {
      state.buildClock += dt;
      const path = findPath(state.actors.buddy, PLACES.bridge, false);
      if (state.moveClock === 0 && path.length) state.actors.buddy = path[0];
      if (same(state.actors.buddy, PLACES.bridge) && state.buildClock > 1.2) {
        state.built = true; state.building = false;
        say('buddy', 'Bridge ready! Your planks did the trick. Come on, team!');
      }
    }
    if (state.goingToSwitch && state.moveClock === 0) {
      const path = findPath(state.actors.nova, PLACES.switch, true);
      if (path.length) state.actors.nova = path[0];
      if (same(state.actors.nova, PLACES.switch)) {
        state.goingToSwitch = false; state.holding = true;
        say('nova', 'I’ve got the switch. Take your time; I’ll keep the lantern powered.');
        say('pip', 'Nova has the power. Go on, light it up!');
      }
    }
    if (state.complete) {
      state.actors.buddy = { c: 11, r: 7 }; state.actors.nova = { c: 12, r: 8 }; state.actors.pip = { c: 13, r: 7 };
    }
  }
  return { state, start, walkTo, interact, send, tick };
}
