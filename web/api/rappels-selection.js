function heureEffective(tache, heureDefaut) {
  return tache.heure_rappel != null ? tache.heure_rappel : heureDefaut;
}

function tachesAEnvoyer(taches, heureDefaut, heureCourante) {
  return taches.filter(t => heureEffective(t, heureDefaut) === heureCourante);
}

module.exports = { heureEffective, tachesAEnvoyer };
