// story.js — the people and the plot of Sirena Bay, as data. Marco Reyes comes home to a
// sinking family hotel, a sister who runs the bay's quiet economy, and El Faro — the old
// lighthouse keeper who decided the whole coast is his. Six chained missions take Marco
// from errand boy to the man who takes the bay back. The runner in missions.js reads these
// tables; every place named here is a real place in citygen.js.

export const CHARACTERS = {
  marco: { name: 'Marco Reyes', color: '#ffd28a' },
  lucia: { name: 'Lucia Reyes', color: '#8ad8ff' },
  deac: { name: 'Deacon "Deac" Cole', color: '#a8ffb0' },
  vera: { name: 'Vera Santos', color: '#ffb0d8' },
  faro: { name: 'El Faro', color: '#ff9a8a' },
  tito: { name: 'Tito Marín', color: '#ff9a8a' },
  ruiz: { name: 'Capt. Ruiz (SBPD)', color: '#b0c8ff' },
};

export const MISSIONS = [
  {
    id: 'welcome', title: 'Welcome to Sirena', giver: 'vera',
    meet: { x: 225, z: 436, label: 'Meet Vera at Hotel Rey' },
    reward: 150,
    stages: [
      {
        kind: 'dialogue', lines: [
          ['vera', 'Marco Reyes. Ten years gone and you still walk like you own the sand.'],
          ['marco', 'The hotel looks tired, Vera.'],
          ['vera', 'Everything El Faro touches gets tired. He took the marina fees, the fishing boats — now he wants my hotel.'],
          ['lucia', 'Which is why I called you home, hermanito. We push back, or we drown. Start by meeting Deac at the pier.'],
        ],
      },
      { kind: 'goto', x: -30, z: 315, r: 7, label: 'Meet Deac at Marina Pier' },
      {
        kind: 'dialogue', lines: [
          ['deac', 'Marco! Still allergic to honest work, I hope.'],
          ['marco', 'Deac. You still owe me a car.'],
          ['deac', 'And you shall have the pick of Sirena, amigo. Anything with wheels is yours — just bring it to my shop when it smokes.'],
        ],
      },
      { kind: 'goto', x: 225, z: 287, r: 9, label: 'Take in Plaza del Sol' },
      {
        kind: 'dialogue', lines: [
          ['lucia', 'See it, Marco? Our bay. Faro counts money in the Casino Solara and thinks the view is his too.'],
          ['marco', 'Then we start charging him rent.'],
        ],
      },
    ],
  },
  {
    id: 'first-wheels', title: 'First Wheels', giver: 'deac',
    meet: { x: 352, z: 254, label: 'Meet Deac at Reef Customs' },
    reward: 300,
    stages: [
      {
        kind: 'dialogue', lines: [
          ['deac', 'A collector at the Casino Solara parks a Vireo Coupe outside every night. Faro\'s collector.'],
          ['deac', 'Lift it, bring it here, and we sell his own car back to his insurance. Poetic, no?'],
          ['marco', 'Watch the door for me.'],
        ],
      },
      { kind: 'steal', x: 276, z: 189.5, yaw: -Math.PI / 2, carType: 'coupe', color: 0xd94f3d, label: 'Steal the Vireo Coupe at Casino Solara' },
      { kind: 'deliver', x: 352, z: 254, r: 8, label: 'Deliver the coupe to Reef Customs' },
      {
        kind: 'dialogue', lines: [
          ['deac', 'Beautiful. New plates, new paint, new life. You drive like the Marco I remember.'],
          ['marco', 'Keep the shop warm. This is just the first.'],
        ],
      },
    ],
  },
  {
    id: 'rey-job', title: 'The Rey Job', giver: 'vera',
    meet: { x: 225, z: 436, label: 'Meet Vera at Hotel Rey' },
    reward: 550,
    stages: [
      {
        kind: 'dialogue', lines: [
          ['vera', 'A guest left a package in room service storage — medicine for the clinic in Old Town, if anyone asks.'],
          ['vera', 'Faro\'s boys heard about it too. They\'re watching the marina. Get it there anyway, Marco.'],
        ],
      },
      { kind: 'pickup', x: 225, z: 402, r: 3.5, label: 'Collect the package behind Hotel Rey' },
      { kind: 'fight', x: -34, z: 318, count: 3, label: 'Clear Faro\'s boys off the pier' },
      { kind: 'goto', x: 352, z: 374, r: 7, label: 'Bring the package to the Reyes Safehouse' },
      {
        kind: 'dialogue', lines: [
          ['lucia', 'The clinic gets its medicine, Faro gets the message: the bay has teeth again.'],
          ['marco', 'He\'ll bite back, Lu.'],
          ['lucia', 'Let him. We\'re just getting warm.'],
        ],
      },
    ],
  },
  {
    id: 'bahia-heat', title: 'Heat on the Bahía', giver: 'lucia',
    meet: { x: 352, z: 374, label: 'Meet Lucia at the Reyes Safehouse' },
    reward: 800,
    stages: [
      {
        kind: 'dialogue', lines: [
          ['lucia', 'Faro\'s crew shook down Bahía Market this morning — every stall, in daylight. The merchants are done paying.'],
          ['marco', 'So we un-pay them. Loudly.'],
          ['lucia', 'Loudly. Then you vanish — the SBPD will come running, and Captain Ruiz does not miss.'],
        ],
      },
      { kind: 'fight', x: 414, z: 188, count: 4, label: 'Run Faro\'s crew out of Bahía Market' },
      { kind: 'escape', x: 352, z: 374, r: 7, needStars: 0, label: 'Lose the heat, then reach the safehouse' },
      {
        kind: 'dialogue', lines: [
          ['ruiz', 'Whoever you are — I will learn your name. That is a promise from the SBPD.'],
          ['lucia', 'She almost sounds worried, Marco. Good. Worried people make mistakes.'],
        ],
      },
    ],
  },
  {
    id: 'faros-toll', title: "Faro's Toll", giver: 'deac',
    meet: { x: -14, z: 446, label: 'Meet Deac at El Faro Point' },
    reward: 1100,
    stages: [
      {
        kind: 'dialogue', lines: [
          ['deac', 'Every boat that lands at night pays Faro\'s toll at this lighthouse. Tonight the toll truck sits loaded — cash, all of it.'],
          ['marco', 'And the SBPD?'],
          ['deac', 'Watching it too, probably. So drive like the tide, amigo — fast and impossible to hold.'],
        ],
      },
      { kind: 'steal', x: -4, z: 449, yaw: Math.PI / 2, carType: 'pickup', color: 0x2c3136, label: 'Take the toll pickup at El Faro Point', heatOnSteal: 3 },
      { kind: 'deliver', x: -30, z: 315, r: 9, label: 'Get the pickup to Marina Pier' },
      {
        kind: 'dialogue', lines: [
          ['lucia', 'A whole season of tolls, Marco. The clinic, the market, the boats — everyone eats this winter.'],
          ['faro', 'Reyes. You have something of mine. Tito will come and explain property law to you.'],
        ],
      },
    ],
  },
  {
    id: 'sirena-heat', title: 'Sirena Heat', giver: 'vera',
    meet: { x: 288, z: 196, label: 'Meet Vera at Casino Solara' },
    reward: 2500,
    stages: [
      {
        kind: 'dialogue', lines: [
          ['vera', 'Tito Marín is holding court at Plaza del Sol, telling the whole bay the Reyes family is finished.'],
          ['marco', 'Then let\'s finish the conversation in person.'],
          ['vera', 'After — the marina. My boat, the Blue Hour. Whatever happens, end it on the water.'],
        ],
      },
      { kind: 'fight', x: 225, z: 287, count: 5, boss: true, label: 'Face Tito Marín at Plaza del Sol', heatAfter: 4 },
      { kind: 'escape', x: -40, z: 315, r: 8, needStars: 99, label: 'Escape to the Blue Hour at Marina Pier' },
      {
        kind: 'dialogue', lines: [
          ['faro', 'The light stays on, Reyes. Lighthouses outlive storms.'],
          ['marco', 'Then watch it, old man. Watch the bay belong to everyone again.'],
          ['lucia', 'Sirena is ours, hermanito. Ours and everybody\'s. Now — let\'s go eat.'],
        ],
      },
    ],
  },
];
