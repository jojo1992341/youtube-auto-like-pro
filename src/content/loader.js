/**
 * ES MODULE LOADER
 * 
 * Ce fichier est le point d'entrée déclaré dans le manifest.json.
 * Il ne contient AUCUNE logique métier.
 * 
 * Son seul but est de contourner la limitation de Chrome qui interdit
 * les modules ES6 directs dans les Content Scripts.
 */
(async () => {
  // On pointe vers le nouvel orchestrateur refactorisé
  const src = chrome.runtime.getURL('src/content/ContentScript.js');
  
  try {
    // Import dynamique du vrai cerveau de l'extension
    await import(src);
  } catch (e) {
    // Si ça échoue ici, c'est souvent une erreur de chemin dans web_accessible_resources
    console.error('❌ [AutoLike Loader] Critical: Failed to load ContentScript module.', e);
  }
})();