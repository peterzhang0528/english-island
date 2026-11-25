// Mission actions are deterministic. AI dialogue never grants progress or executes code.
export const OBJECTIVES = ['Get the crew across', 'Bring the power online', 'Decode the ship’s signal', 'Guide the boat home'];
export const SIGNAL = ['blue', 'amber', 'blue'];
export const STATIONS = { bridge: { x: -6, z: 3 }, power: { x: 0, z: 2.7 }, tower: { x: 5.8, z: 0 } };
export const createMission = () => ({ stage: 0, bridge: false, holding: false, power: false, signalKnown: false, code: [], bearing: -2, rescued: false, calls: 0 });

export function commandIntent(text) {
  const s = String(text).toLowerCase().replace(/[’']/g, '').replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/\b(stop|dont|not|never|wont|cannot|cant|shouldnt|isnt|wasnt)\b/.test(s)) return 'chat';
  if (/\b(fix|repair|build)\b/.test(s) && /\b(bridge|it)\b/.test(s)) return 'bridge';
  if (/\b(hold|press|keep)\b/.test(s) && /\b(switch|button|power|it)\b/.test(s)) return 'hold';
  if (/\b(signal|code|pattern|colou?r)\b/.test(s) && !/\b(blue|amber)\b/.test(s)) return 'signal';
  if (/\b(left|right)\b/.test(s) && /\b(aim|turn|light|beam|go)\b/.test(s)) return s.includes('left') ? 'left' : 'right';
  if (/\b(help|hint|what next|where|stuck)\b/.test(s)) return 'help';
  return 'chat';
}

export function applyCommand(state, text) {
  if (state.rescued) return { who: 'leo', text: 'All three crew members are safe. Nice work, captain!', zh: '三位船员都安全了。干得好，队长！' };
  const intent = commandIntent(text); state.calls++;
  if (intent === 'bridge') {
    if (state.bridge) return { who: 'mia', text: 'Bridge is solid. Let’s keep moving!', zh: '桥已经修好了。继续前进！' };
    state.bridge = true; state.stage = 1;
    return { who: 'mia', text: 'On it! I’ll fit the planks. Leo, keep watch. You can cross now!', zh: '交给我！我来铺木板。Leo，注意观察。现在可以过桥了！', event: 'bridge' };
  }
  if (intent === 'hold') {
    if (!state.bridge) return { who: 'mia', text: 'The bridge is broken. Can you ask me to fix it first?', zh: '桥断了。先让我修桥吧？' };
    if (state.power) return { who: 'mia', text: 'Power is already on. Leo, check the ship!', zh: '电已经通了。Leo，看看船！' };
    state.holding = true;
    return { who: 'mia', text: 'Holding the switch! Your turn — crank the generator at the power station.', zh: '我按住开关了！轮到你了——去发电站转动摇柄。', event: 'hold' };
  }
  if (intent === 'signal') {
    if (!state.power) return { who: 'leo', text: 'Too dark to read it. Mia holds the switch; you turn the crank!', zh: '太暗了，读不清。Mia 按住开关，你来转摇柄！' };
    state.signalKnown = true;
    return { who: 'leo', text: 'I see it! Blue, amber, blue. Send that pattern from the lighthouse!', zh: '看到了！蓝、琥珀、蓝。在灯塔发出这个信号！', event: 'signal' };
  }
  if (intent === 'left' || intent === 'right') {
    if (state.stage !== 3) return { who: 'leo', text: 'We need power and the ship’s signal before aiming the light.', zh: '先供电、确认船的信号，再调整灯光。' };
    state.bearing = Math.max(-3, Math.min(3, state.bearing + (intent === 'left' ? -1 : 1)));
    return { who: 'leo', text: state.bearing === 0 ? 'That’s it! The beam is on the boat. Send them home!' : state.bearing < 0 ? 'A little more to the right!' : 'A little more to the left!', zh: state.bearing === 0 ? '对了！灯光对准船了。引导他们回家！' : state.bearing < 0 ? '再往右一点！' : '再往左一点！', event: 'aim' };
  }
  if (intent === 'help') return hints(state);
  return { ...hints(state), chat: true };
}

export function hints(state) {
  return [
    { who: 'leo', text: 'The bridge is out! Mia has tools. Try “Mia, can you fix the bridge?”', zh: '桥断了！Mia 有工具，试试让她修桥。' },
    { who: 'mia', text: state.holding ? 'I’m holding the switch. Go to Power and turn the crank!' : 'This needs two of us. Ask me to hold the switch, then you turn the crank.', zh: state.holding ? '我正按着开关。去发电站转摇柄！' : '需要两个人。让我按住开关，然后你转摇柄。' },
    { who: 'leo', text: state.signalKnown ? 'Blue, amber, blue. Use the signal controls at the lighthouse.' : 'I can read the boat’s lights. Ask me “What’s the signal?”', zh: state.signalKnown ? '蓝、琥珀、蓝。在灯塔操作信号灯。' : '我能看清船灯，问我船的信号吧。' },
    { who: 'leo', text: state.bearing === 0 ? 'Perfect! Send the boat home with the action button.' : 'Aim the light two steps right. The boat needs a clear path!', zh: state.bearing === 0 ? '完美！用动作按钮引导船返航。' : '灯光向右转两格。船需要清晰的路线！' },
  ][Math.min(3, state.stage)];
}

export function interact(state, station, color) {
  if (state.rescued) return { who: 'leo', text: 'We did it. Everyone is home!', zh: '成功了。大家都回家了！' };
  if (station === 'bridge') return hints(state);
  if (!state.bridge) return hints(state);
  if (station === 'power') {
    if (state.power) return { who: 'mia', text: 'The generator is running. Let’s head to the lighthouse!', zh: '发电机运转中。去灯塔吧！' };
    if (!state.holding) return { who: 'mia', text: 'The switch won’t stay down! Ask me to hold it while you crank.', zh: '开关会弹起来！让我按着，你再转摇柄。' };
    state.power = true; state.stage = 2;
    return { who: 'mia', text: 'Yes! We’ve got power. Leo, can you see the boat now?', zh: '有电了！Leo，现在能看到船了吗？', event: 'power' };
  }
  if (!state.power || !state.signalKnown) return hints(state);
  if (state.stage === 2) {
    if (!['blue', 'amber'].includes(color)) return { who: 'leo', text: 'Send the colors in order: blue, amber, blue.', zh: '依次发出：蓝、琥珀、蓝。' };
    if (color !== SIGNAL[state.code.length]) {
      state.code = [];
      return { who: 'leo', text: 'That’s a different signal. No worries — start with blue again!', zh: '信号不对。没关系，从蓝色重新开始！', event: 'retry' };
    }
    state.code.push(color);
    if (state.code.length === 3) {
      state.stage = 3;
      return { who: 'leo', text: 'They answered! Now aim the beam at the boat. A little to the right!', zh: '他们回应了！现在把灯光对准船，再往右一点！', event: 'decoded' };
    }
    return { who: 'leo', text: state.code.length === 1 ? 'Blue received. What comes next?' : 'Amber received. One more flash!', zh: state.code.length === 1 ? '收到蓝色，下一个呢？' : '收到琥珀色，再发一次！', event: 'flash' };
  }
  if (state.bearing !== 0) return { who: 'leo', text: state.bearing < 0 ? 'Not on the boat yet. Aim right!' : 'Too far. Aim left!', zh: state.bearing < 0 ? '还没对准船。向右！' : '转过头了。向左！' };
  state.rescued = true; state.stage = 4;
  return { who: 'mia', text: 'They’re following the light! Three crew, all safe. That was teamwork!', zh: '他们正沿灯光回港！三位船员全部安全。配合得真棒！', event: 'rescued' };
}

export function quickCommands(state) {
  if (state.stage === 0) return ['Mia, can you fix the bridge?', 'Leo, keep watch.', 'Need a hand?'];
  if (state.stage === 1) return ['Mia, hold the switch.', 'I’ll turn the crank.', 'What next?'];
  if (state.stage === 2) return state.signalKnown ? ['Blue', 'Amber', 'What’s the signal?'] : ['Leo, what’s the signal?', 'Can you see the boat?'];
  if (state.stage === 3) return ['Aim left', 'Aim right', 'Follow the light!'];
  return [];
}
