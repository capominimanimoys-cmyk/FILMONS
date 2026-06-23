/**
 * Filmons i18n — EN / FR
 * Usage:  const t = useT();  then  {t('key')}
 * Switch: localStorage.setItem('filmons_language','fr-CA')
 *         window.dispatchEvent(new Event('filmons:locale'))
 */
import { useState, useEffect } from 'react';

export type Locale = 'en-CA' | 'fr-CA';

export const TR: Record<Locale, Record<string, string>> = {
  'en-CA': {
    /* ── Nav ── */
    'nav.home':'Home','nav.explore':'Explore','nav.marketplace':'Marketplace','nav.feed':'Feed',
    'nav.alerts':'Alerts','nav.inbox':'Inbox','nav.profile':'Profile',

    /* ── Home ── */
    'home.headline1':'Rent. Hire.','home.headline2':'Create.',
    'home.subtitle':'Film gear, services & creative pros — all in one marketplace.',
    'home.search_placeholder':'Cameras, editors, drones…','home.search_btn':'Search',
    'home.latest':'Latest listings','home.view_all':'View all','home.fresh_desc':'Fresh gear & services',
    'home.how_title':'How Filmons works','home.how_sub':'Built by filmmakers, for filmmakers',
    'home.step1_title':'Browse & discover','home.step1_desc':'Search film gear and creative services across Canada.',
    'home.step2_title':'Book & coordinate','home.step2_desc':'Send a request, chat, confirm dates.',
    'home.step3_title':'Shoot & earn','home.step3_desc':'Use the gear or hire the pro. Earn FP on every transaction.',
    'home.cta_title':'Ready to monetize your gear?',
    'home.cta_sub':'Join thousands of filmmakers earning from their equipment.',
    'home.start_listing':'Start listing','home.browse':'Browse',

    /* ── Marketplace ── */
    'market.search':'Search cameras, editors, drones…',
    'market.add':'+ List','market.all':'All','market.rent':'🎬 Rentals',
    'market.sale':'💰 Sale','market.service':'🎥 Services',
    'market.listings':'listings','market.no_results':'No listings found',
    'market.clear':'Clear filters',

    /* ── Profile ── */
    'profile.edit':'Edit profile','profile.settings':'Settings',
    'profile.followers':'followers','profile.following':'following','profile.posts':'posts',
    'profile.overview':'Overview','profile.posts_tab':'Posts','profile.listings_tab':'Listings',
    'profile.liked':'Liked','profile.saved':'Saved','profile.reviews':'Reviews','profile.about':'About',
    'profile.no_bio':'No bio yet.','profile.no_posts':'No posts yet.',
    'profile.no_listings':'No listings yet.','profile.no_reviews':'No reviews yet.',

    /* ── About sections ── */
    'about.personal':'Personal Details','about.overview':'Overview',
    'about.professional':'Professional Identity','about.skills':'Skills & Specialties',
    'about.gear':'Gear & Tools','about.location':'Location',
    'about.social':'Social & Links','about.collab':'Collaboration',
    'about.save':'💾 Save all changes','about.saving':'Saving…',
    'about.name':'Display name','about.username':'Username','about.bio':'Bio / Creator summary',
    'about.years_exp':'Years of experience','about.primary_role':'Primary Role',
    'about.secondary_roles':'Secondary Roles','about.skills_sub':'Select all that apply',
    'about.gear_sub':'Cameras, software, audio equipment you own or use',
    'about.location_sub':'Canada only · Start typing or tap 📍',
    'about.collab_sub':"Let others know what kind of work you're open to",
    'about.add':'Add','about.add_own':'Add your own…','about.search':'Search…',
    'about.change':'Change','about.cancel':'Cancel',
    'about.send_code':'Send verification code','about.confirm':'Confirm',

    /* ── Settings ── */
    'settings.title':'Settings','settings.edit':'Edit',
    'settings.theme':'Theme','settings.light':'Light','settings.dark':'Dark',
    'settings.light_desc':'Clean & bright','settings.dark_desc':'AMOLED black',
    'settings.language':'Language & Region',
    'settings.profile_section':'PROFILE SECTION','settings.marketplace':'MARKETPLACE',
    'settings.communication':'COMMUNICATION','settings.trust':'TRUST & SAFETY',
    'settings.actions':'ACCOUNT ACTIONS','settings.help':'HELP & SUPPORT',
    'settings.account':'Account','settings.dashboard':'Professional Dashboard',
    'settings.portfolio':'Portfolio','settings.orders':'Rentals & Orders',
    'settings.listings':'My Listings','settings.wallet':'Wallet & Payments',
    'settings.messages':'Messages','settings.notifications':'Notifications',
    'settings.verification':'Verification','settings.privacy':'Privacy',
    'settings.security':'Security','settings.reviews':'Reviews & Reputation',
    'settings.devices':'Linked Devices','settings.logout':'Log Out',
    'settings.delete':'Delete Account','settings.help_center':'Help Center',
    'settings.terms':'Terms & Conditions','settings.privacy_policy':'Privacy Policy',
    'settings.report':'Report a Problem',

    /* ── Notifications ── */
    'notif.title':'Notification Settings',
    'notif.push':'Push Notifications','notif.email':'Email Notifications',
    'notif.messages':'Messaging','notif.social':'Social Activity',
    'notif.collab':'Collaboration','notif.marketplace':'Marketplace',
    'notif.portfolio':'Portfolio','notif.analytics':'Analytics',
    'notif.sound':'Sound & Vibration','notif.quiet':'Quiet Mode',
    'notif.save':'Save notification settings',

    /* ── Host profile ── */
    'host.follow':'Follow','host.following':'Following','host.message':'Message',
    'host.verified':'Verified','host.experience':'yrs experience',
    'host.no_posts':'No posts yet.','host.no_listings':'No listings yet.',
    'host.no_reviews':'No reviews yet.','host.no_links':'No links added yet.',
    'host.contact':'Contact & Links','host.skills':'Skills',
    'host.gear':'Gear & Tools','host.open_to':'Open to',
  },

  'fr-CA': {
    /* ── Nav ── */
    'nav.home':'Accueil','nav.explore':'Explorer','nav.marketplace':'Marché','nav.feed':'Fil',
    'nav.alerts':'Alertes','nav.inbox':'Messages','nav.profile':'Profil',

    /* ── Home ── */
    'home.headline1':'Louer. Embaucher.','home.headline2':'Créer.',
    'home.subtitle':'Matériel de tournage, services & créatifs — tout en un seul endroit.',
    'home.search_placeholder':'Caméras, monteurs, drones…','home.search_btn':'Rechercher',
    'home.latest':'Dernières annonces','home.view_all':'Voir tout','home.fresh_desc':'Matériel & services récents',
    'home.how_title':'Comment fonctionne Filmons','home.how_sub':'Conçu par des cinéastes, pour des cinéastes',
    'home.step1_title':'Parcourir et découvrir','home.step1_desc':'Recherchez du matériel et des services créatifs partout au Canada.',
    'home.step2_title':'Réserver et coordonner','home.step2_desc':'Envoyez une demande, discutez, confirmez les dates.',
    'home.step3_title':'Tourner et gagner','home.step3_desc':'Utilisez le matériel ou embauchez le pro. Gagnez des FP à chaque transaction.',
    'home.cta_title':'Prêt à monétiser votre équipement?',
    'home.cta_sub':'Rejoignez des milliers de cinéastes qui tirent profit de leur équipement.',
    'home.start_listing':'Commencer à lister','home.browse':'Explorer',

    /* ── Marketplace ── */
    'market.search':'Rechercher caméras, monteurs, drones…',
    'market.add':'+ Lister','market.all':'Tout','market.rent':'🎬 Locations',
    'market.sale':'💰 Vente','market.service':'🎥 Services',
    'market.listings':'annonces','market.no_results':'Aucune annonce trouvée',
    'market.clear':'Effacer les filtres',

    /* ── Profile ── */
    'profile.edit':'Modifier le profil','profile.settings':'Paramètres',
    'profile.followers':'abonnés','profile.following':'abonnements','profile.posts':'publications',
    'profile.overview':'Aperçu','profile.posts_tab':'Publications','profile.listings_tab':'Annonces',
    'profile.liked':'Aimé','profile.saved':'Enregistré','profile.reviews':'Avis','profile.about':'À propos',
    'profile.no_bio':'Aucune biographie encore.','profile.no_posts':'Aucune publication.',
    'profile.no_listings':'Aucune annonce.','profile.no_reviews':'Aucun avis.',

    /* ── About ── */
    'about.personal':'Informations personnelles','about.overview':'Aperçu',
    'about.professional':'Identité professionnelle','about.skills':'Compétences et spécialités',
    'about.gear':'Équipement et outils','about.location':'Localisation',
    'about.social':'Liens et réseaux','about.collab':'Collaboration',
    'about.save':'💾 Enregistrer tout','about.saving':'Enregistrement…',
    'about.name':'Nom affiché','about.username':"Nom d'utilisateur",'about.bio':'Biographie / Résumé créatif',
    'about.years_exp':"Années d'expérience",'about.primary_role':'Rôle principal',
    'about.secondary_roles':'Rôles secondaires','about.skills_sub':'Sélectionnez tout ce qui s\'applique',
    'about.gear_sub':'Caméras, logiciels, équipement audio que vous possédez ou utilisez',
    'about.location_sub':'Canada seulement · Commencez à taper ou appuyez sur 📍',
    'about.collab_sub':'Indiquez aux autres quel type de travail vous intéresse',
    'about.add':'Ajouter','about.add_own':'Ajouter le vôtre…','about.search':'Rechercher…',
    'about.change':'Modifier','about.cancel':'Annuler',
    'about.send_code':'Envoyer le code de vérification','about.confirm':'Confirmer',

    /* ── Settings ── */
    'settings.title':'Paramètres','settings.edit':'Modifier',
    'settings.theme':'Thème','settings.light':'Clair','settings.dark':'Sombre',
    'settings.light_desc':'Propre et lumineux','settings.dark_desc':'Noir AMOLED',
    'settings.language':'Langue et région',
    'settings.profile_section':'SECTION PROFIL','settings.marketplace':'MARCHÉ',
    'settings.communication':'COMMUNICATION','settings.trust':'CONFIANCE ET SÉCURITÉ',
    'settings.actions':'ACTIONS COMPTE','settings.help':'AIDE ET SUPPORT',
    'settings.account':'Compte','settings.dashboard':'Tableau de bord professionnel',
    'settings.portfolio':'Portfolio','settings.orders':'Locations et commandes',
    'settings.listings':'Mes annonces','settings.wallet':'Portefeuille et paiements',
    'settings.messages':'Messages','settings.notifications':'Notifications',
    'settings.verification':'Vérification','settings.privacy':'Confidentialité',
    'settings.security':'Sécurité','settings.reviews':'Avis et réputation',
    'settings.devices':'Appareils liés','settings.logout':'Déconnexion',
    'settings.delete':'Supprimer le compte','settings.help_center':'Centre d\'aide',
    'settings.terms':'Conditions d\'utilisation','settings.privacy_policy':'Politique de confidentialité',
    'settings.report':'Signaler un problème',

    /* ── Notifications ── */
    'notif.title':'Paramètres de notifications',
    'notif.push':'Notifications push','notif.email':'Notifications par courriel',
    'notif.messages':'Messagerie','notif.social':'Activité sociale',
    'notif.collab':'Collaboration','notif.marketplace':'Marché',
    'notif.portfolio':'Portfolio','notif.analytics':'Analytique',
    'notif.sound':'Son et vibration','notif.quiet':'Mode silencieux',
    'notif.save':'Enregistrer les paramètres de notifications',

    /* ── Host profile ── */
    'host.follow':'Suivre','host.following':'Suivi','host.message':'Message',
    'host.verified':'Vérifié','host.experience':'ans d\'expérience',
    'host.no_posts':'Aucune publication.','host.no_listings':'Aucune annonce.',
    'host.no_reviews':'Aucun avis.','host.no_links':'Aucun lien ajouté.',
    'host.contact':'Liens et contact','host.skills':'Compétences',
    'host.gear':'Équipement','host.open_to':'Ouvert à',
  },
};

export function getLocale(): Locale {
  try {
    const v = localStorage.getItem('filmons_language');
    return v === 'fr-CA' ? 'fr-CA' : 'en-CA';
  } catch { return 'en-CA'; }
}

export function t(key: string, locale?: Locale): string {
  const l = locale ?? getLocale();
  return TR[l]?.[key] ?? TR['en-CA']?.[key] ?? key;
}

export function useT() {
  const [locale, setLocale] = useState<Locale>(getLocale);
  useEffect(() => {
    const h = () => setLocale(getLocale());
    window.addEventListener('filmons:locale', h);
    return () => window.removeEventListener('filmons:locale', h);
  }, []);
  return (key: string) => TR[locale]?.[key] ?? TR['en-CA']?.[key] ?? key;
}