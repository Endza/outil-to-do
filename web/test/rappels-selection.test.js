const assert = require("assert");
const { heureEffective, tachesAEnvoyer } = require("../api/rappels-selection");

assert.strictEqual(heureEffective({ heure_rappel: null }, 8), 8);
assert.strictEqual(heureEffective({ heure_rappel: 14 }, 8), 14);

const taches = [
  { id: "a", heure_rappel: null },
  { id: "b", heure_rappel: 14 },
  { id: "c", heure_rappel: 9 },
];
assert.deepStrictEqual(tachesAEnvoyer(taches, 9, 9).map(t => t.id), ["a", "c"]);
assert.deepStrictEqual(tachesAEnvoyer(taches, 9, 14).map(t => t.id), ["b"]);
assert.deepStrictEqual(tachesAEnvoyer(taches, 9, 10).map(t => t.id), []);

console.log("OK");
