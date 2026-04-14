import Database from 'better-sqlite3';

const db = new Database('data/memory.db');
db.pragma('foreign_keys = ON');

const now = Date.now();

type Seed = { name: string; bg: string; strength: number; tags: string[] };

const people: Seed[] = [
  { name: 'Sarah', bg: 'sf', strength: 8, tags: ['highsignal', 'friends'] },
  { name: 'Mike', bg: 'sf', strength: 7, tags: ['friends', 'fun'] },
  { name: 'Jess', bg: 'sf', strength: 6.5, tags: ['helpful', 'interesting'] },
  { name: 'Nate', bg: 'sf', strength: 5.5, tags: ['interesting'] },
  { name: 'Ravi', bg: 'sf', strength: 7, tags: ['highsignal', 'important'] },

  { name: 'Marcus', bg: 'plano', strength: 8, tags: ['friends', 'important'] },
  { name: 'Priya', bg: 'plano', strength: 6, tags: ['fun', 'friends'] },
  { name: 'Danny', bg: 'plano', strength: 5, tags: ['fun'] },
  { name: 'Tasha', bg: 'plano', strength: 4, tags: ['interesting'] },

  { name: 'Evan', bg: 'ut', strength: 8.5, tags: ['highsignal', 'friends'] },
  { name: 'Sophie', bg: 'ut', strength: 7.5, tags: ['fun', 'friends'] },
  { name: 'Raj', bg: 'ut', strength: 6, tags: ['interesting', 'helpful'] },
  { name: 'Kim', bg: 'ut', strength: 4.5, tags: ['interesting'] },

  { name: 'Alex', bg: 'allen', strength: 7, tags: ['friends'] },
  { name: 'Ben', bg: 'allen', strength: 5.5, tags: ['fun'] },
  { name: 'Lila', bg: 'allen', strength: 4, tags: ['interesting'] },

  { name: 'Mom', bg: 'family', strength: 10, tags: ['important', 'highsignal'] },
  { name: 'Dad', bg: 'family', strength: 9.5, tags: ['important', 'highsignal'] },
  { name: 'Arjun', bg: 'family', strength: 8, tags: ['important', 'friends'] },

  { name: 'Jordan', bg: 'climb', strength: 7, tags: ['friends', 'fun'] },
  { name: 'Kai', bg: 'climb', strength: 6, tags: ['fun', 'interesting'] },
  { name: 'Elena', bg: 'climb', strength: 5, tags: ['interesting'] },

  { name: 'Mei', bg: 'online', strength: 6.5, tags: ['highsignal', 'interesting'] },
  { name: 'Theo', bg: 'online', strength: 5, tags: ['interesting'] },
];

const thoughts: { body: string; mentions: string[] }[] = [
  { body: 'got dinner with Sarah and Mike in SF, talked about climbing at Dogpatch with Jordan', mentions: ['Sarah', 'Mike', 'Jordan'] },
  { body: 'Had coffee with Alex in allen, went to highschool together', mentions: ['Alex'] },
  { body: 'Ran into Marcus and Priya downtown, Marcus is moving back to dallas', mentions: ['Marcus', 'Priya'] },
  { body: 'Evan called about the startup idea, Sophie is in on it too', mentions: ['Evan', 'Sophie'] },
  { body: 'Climbed with Jordan and Kai at dogpatch, Kai sent his v7 project', mentions: ['Jordan', 'Kai'] },
  { body: 'Mom and Dad came to visit, took them to the ferry building with Arjun', mentions: ['Mom', 'Dad', 'Arjun'] },
  { body: 'Jess helped me debug the auth flow, Nate joined the call toward the end', mentions: ['Jess', 'Nate'] },
  { body: 'Raj sent that paper, Evan and I are gonna read it this weekend', mentions: ['Raj', 'Evan'] },
  { body: 'Mei dm\'d me about the essay, Theo had a good take in the replies', mentions: ['Mei', 'Theo'] },
  { body: 'Ben texted, Lila is back in town for the weekend', mentions: ['Ben', 'Lila'] },
  { body: 'Ravi introduced me to Elena at the climbing gym — she knows Jordan', mentions: ['Ravi', 'Elena', 'Jordan'] },
  { body: 'Sophie and Kim grabbed brunch in austin, both miss the old apartment', mentions: ['Sophie', 'Kim'] },
  { body: 'Marcus called, catching up. He asked about Tasha and Danny', mentions: ['Marcus', 'Tasha', 'Danny'] },
  { body: 'Sarah and Jess are working on a side project together', mentions: ['Sarah', 'Jess'] },
  { body: 'Arjun and Mom facetimed about dad\'s birthday plans', mentions: ['Arjun', 'Mom', 'Dad'] },
];

db.exec('BEGIN');

const insertPerson = db.prepare(
  'INSERT OR IGNORE INTO people (name, bg, strength, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
);
const updatePerson = db.prepare(
  'UPDATE people SET bg = ?, strength = ?, tags = ?, updated_at = ? WHERE name = ?'
);
const getPerson = db.prepare('SELECT id FROM people WHERE name = ?');
const insertThought = db.prepare('INSERT INTO thoughts (body, created_at) VALUES (?, ?)');
const insertMention = db.prepare('INSERT INTO mentions (thought_id, person_id) VALUES (?, ?)');

for (const p of people) {
  insertPerson.run(p.name, p.bg, p.strength, JSON.stringify(p.tags), now, now);
  updatePerson.run(p.bg, p.strength, JSON.stringify(p.tags), now, p.name);
}

let t = now - thoughts.length * 3600 * 1000;
for (const th of thoughts) {
  const { lastInsertRowid } = insertThought.run(th.body, t);
  for (const name of th.mentions) {
    const row = getPerson.get(name) as { id: number } | undefined;
    if (row) insertMention.run(lastInsertRowid, row.id);
  }
  t += 3600 * 1000;
}

db.exec('COMMIT');

const count = db.prepare('SELECT COUNT(*) as n FROM people').get() as { n: number };
const tcount = db.prepare('SELECT COUNT(*) as n FROM thoughts').get() as { n: number };
const mcount = db.prepare('SELECT COUNT(*) as n FROM mentions').get() as { n: number };
console.log(`seeded: ${count.n} people, ${tcount.n} thoughts, ${mcount.n} mentions`);
