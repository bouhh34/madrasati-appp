function installClassPrint(data,root){
  const actions=document.createElement('div');actions.className='attendance-toolbar';
  const query=new URLSearchParams({classId:data.classroom.id,term:data.period,lang:locale});
  if(data.scope==='SUBJECT')query.set('subjectId',data.subjects[0].id);
  for(const [format,title] of [['cards',st('طباعة جميع كشوف القسم · تلميذان في كل A4','Imprimer tous les bulletins · 2 élèves par A4')],['roster',st('طباعة لائحة النتائج','Imprimer la liste des résultats')]]){
    const link=document.createElement('a');link.className='ghost report-print-link';link.target='_blank';link.rel='noopener';link.textContent=title;
    const params=new URLSearchParams(query);params.set('format',format);link.href=`/print.html?${params}`;actions.append(link);
  }
  root.prepend(actions);
}
function printStudentReport(studentId){
  const term=$('resultTerm')?.value||$('termSelect')?.value||'T1';
  window.open(`/print.html?${new URLSearchParams({studentId,term,lang:locale})}`,'_blank','noopener');
}

/* Keep the whole interface in one language, including content created after page load. */
(()=>{
  const patch={
    'مدرسة موريتانية':'École mauritanienne','موريتانيا':'Mauritanie','منصة مدرسية موريتانية آمنة، سريعة وواضحة.':'Plateforme scolaire mauritanienne sûre, rapide et claire.',
    '15 حرفًا على الأقل':'15 caractères minimum','إنشاء الحساب لا يمنح أي صلاحية مدرسية. المدير هو من يربط الحساب بالمدرسة والصلاحيات.':'La création du compte ne donne aucun accès scolaire. Le directeur associe ensuite le compte à l’école et aux autorisations.',
    'صلاحيات خادمية':'Autorisations côté serveur','عزل المدارس':'Isolation des écoles','أدخل رمز الانضمام الآمن الذي أعطاك إياه المدير. الرمز مخصص للنطاق الذي اختاره المدير وينتهي تلقائيًا.':'Saisissez le code d’accès sécurisé fourni par le directeur. Il est limité au périmètre choisi et expire automatiquement.',
    'تهيئة مالك المنصة':'Initialiser le propriétaire de la plateforme','حسابك مرتبط بأكثر من مدرسة. اختر المدرسة التي تريد العمل داخلها.':'Votre compte est lié à plusieurs écoles. Choisissez celle dans laquelle vous souhaitez travailler.',
    'بسم الله الرحمن الرحيم':'Au nom d’Allah, le Tout Miséricordieux, le Très Miséricordieux',
    'مرحبًا':'Bienvenue','الوصول السريع':'Accès rapide','آخر النشاطات':'Activité récente','لا توجد أقسام متاحة بعد.':'Aucune classe disponible.','لا توجد إشعارات جديدة.':'Aucune nouvelle notification.',
    'إدخال ذكي':'Saisie des notes','اختر القسم والمادة':'Choisissez la classe et la matière','اختر قسمًا ومادة لبدء العمل.':'Choisissez une classe et une matière pour commencer.','النتائج':'Résultats','الإدارة':'Administration',
    'ولي التلميذ':'Tuteur','لا توجد روابط تلاميذ بعد.':'Aucun élève associé.','إداري':'Administrateur','خروج':'Déconnexion','إحصائيات المنصة':'Statistiques de la plateforme',
    'الوصول الآمن':'Accès sécurisé','مستخدمون نشطون':'Utilisateurs actifs','لا توجد بيانات.':'Aucune donnée.','جارٍ تحميل المدارس...':'Chargement des écoles…','جاري تحميل المدارس...':'Chargement des écoles…',
    'الاسم أو اسم المستخدم':'Nom ou identifiant','رمز استرجاع':'Code de récupération','رمز استرجاع لمرة واحدة':'Code de récupération à usage unique',
    'السنة الجديدة':'Nouvelle année','السنة الحالية للمدرسة':'Année scolaire en cours','اعتماد السنة':'Définir comme année en cours','مواد القسم':'Matières de la classe','حفظ المواد':'Enregistrer les matières',
    'تكليف معلم':'Affecter un enseignant','السماح بتسجيل الحضور':'Autoriser la saisie des présences','حفظ التكليف':'Enregistrer l’affectation','الأقسام المسجلة':'Classes enregistrées','نشط':'Active','مؤرشف':'Archivée',
    'الحضور اليومي':'Présence quotidienne','الحضور والغياب':'Présences et absences','اختر قسمًا لعرض التلاميذ.':'Choisissez une classe pour afficher les élèves.','حاضر':'Présent','غائب':'Absent','متأخر':'En retard','غياب مبرر':'Absence justifiée','معذور':'Excusé',
    'حفظ الحضور':'Enregistrer les présences','تقرير الحضور':'Rapport de présence','من':'Du','إلى':'Au','اليوم':'Aujourd’hui','هذا الأسبوع':'Cette semaine','هذا الشهر':'Ce mois','الفصل':'Trimestre',
    'جدول الامتحانات':'Calendrier des examens','إدارة الامتحانات':'Gestion des examens','إنشاء امتحان':'Créer un examen','الامتحانات المسجلة':'Examens enregistrés','المواعيد':'Planning','عنوان الامتحان':'Intitulé de l’examen',
    'وقت البداية':'Heure de début','وقت النهاية':'Heure de fin','القاعة':'Salle','ملاحظات':'Remarques','اختياري':'Facultatif','نشر الامتحان للتلاميذ والأولياء':'Publier l’examen aux élèves et tuteurs','حفظ الامتحان':'Enregistrer l’examen',
    'اختر قسمًا لعرض الامتحانات.':'Choisissez une classe pour afficher les examens.','منشور':'Publié','غير منشور':'Non publié','نشر':'Publier','إلغاء النشر':'Dépublier','حذف':'Supprimer','هل تريد حذف هذا الامتحان؟':'Supprimer cet examen ?',
    'رأسية المدرسة':'En-tête de l’école','رفع ومعالجة الرأسية':'Importer et traiter l’en-tête','رفع الرأسية':'Importer l’en-tête','لم تُرفع رأسية خاصة بعد':'Aucun en-tête personnalisé importé.','المدرسة العمومية تستخدم الرأسية الرسمية الموريتانية':'L’école publique utilise l’en-tête officiel mauritanien.',
    'كشف نتائج التلميذ':'Bulletin de notes','كشف الدرجات':'Bulletin de notes','الجمهورية الإسلامية الموريتانية':'République Islamique de Mauritanie','وزارة التهذيب الوطني وإصلاح النظام التعليمي':'Ministère de l’Éducation nationale et de la Réforme du système éducatif',
    'الإدارة الجهوية':'Direction régionale','مفتشية مقاطعة':'Inspection départementale','شرف - إخاء - عدالة':'Honneur - Fraternité - Justice','رقم التلميذ:':'Matricule :','القسم:':'Classe :','النتيجة العامة:':'Résultat général :',
    'المعدل السنوي':'Moyenne annuelle','معدل الفصل الأول':'Moyenne du trimestre 1','معدل الفصل الثاني':'Moyenne du trimestre 2','معدل الفصل الثالث':'Moyenne du trimestre 3','نتائج غير مكتملة':'Résultats incomplets','لا توجد نتائج مسجلة':'Aucun résultat enregistré',
    'توقيع المدير':'Signature du directeur','ختم المؤسسة':'Cachet de l’établissement','ختم المدرسة':'Cachet de l’école','التوقيع':'Signature','الختم':'Cachet','التحقق من صحة الكشف':'Vérification du bulletin','امسح الرمز لعرض النسخة الموثقة':'Scannez le code pour afficher la version vérifiée',
    'تم إنشاء هذا الكشف بواسطة منصة مدرستي | Ma Madrassa':'Bulletin généré par la plateforme Ma Madrassa','حفظ PDF / طباعة':'Enregistrer en PDF / Imprimer','مشاركة':'Partager','تم نسخ ملخص الكشف':'Résumé du bulletin copié','تعذرت المشاركة':'Partage impossible',
    'ممتاز':'Excellent','جيد جدًا':'Très bien','جيد':'Bien','مقبول':'Passable','يحتاج إلى دعم':'À renforcer','السنوي':'Annuel','الفترة':'Période','عرض النتائج':'Afficher les résultats','نتائج القسم والترتيب':'Résultats et classement',
    'جميع المواد':'Toutes les matières','نتائج المادة':'Résultats de la matière','المصنفون':'Classés','الأعلى':'Maximum','الأدنى':'Minimum','معدل المكتملين':'Moyenne des résultats complets','البحث في النتائج':'Rechercher dans les résultats','مكتمل':'Complet','درجات ناقصة — معدل مؤقت':'Notes manquantes — moyenne provisoire','الكشف':'Bulletin','الترتيب':'Rang',
    'البحث عن تلميذ':'Rechercher un élève','حفظ الدرجات المعدلة':'Enregistrer les notes modifiées','كشف التلميذ':'Bulletin','درجة':'Note','محفوظ':'Enregistré','حفظ':'Enregistrer','لا يوجد تلاميذ نشطون في هذا القسم. أضف تلاميذ من إدارة المدرسة.':'Aucun élève actif dans cette classe. Ajoutez des élèves depuis l’administration.',
    'تحديث':'Actualiser','فتح':'Ouvrir','العودة للتطبيق':'Retour à l’application','طباعة / حفظ PDF':'Imprimer / enregistrer en PDF','السنة الدراسية':'Année scolaire','المدرسة':'École','الولاية':'Wilaya','المقاطعة':'Moughataa','المفتشية':'Inspection','التلميذ':'Élève','التلاميذ':'Élèves','المادة':'Matière','المعامل':'Coefficient','الدرجة القصوى':'Note maximale','الاسم الكامل':'Nom complet','رقم التلميذ':'Matricule','القسم':'Classe','الاسم':'Nom',
    'مبادئ الحماية':'Principes de sécurité','سجل العمليات':'Journal d’audit','عزل كل مدرسة على مستوى الخادم وقاعدة البيانات.':'Isolation de chaque école au niveau du serveur et de la base de données.','رموز دعوة مؤقتة ومخزنة كـ Hash.':'Codes d’invitation temporaires stockés sous forme de hachage.','جلسات HttpOnly وCSRF وفحص Origin.':'Sessions HttpOnly, protection CSRF et contrôle de l’origine.','سجل تغييرات للدرجات وتعارض النسخ.':'Historique des notes et détection des conflits de version.'
  };
  try{if(typeof FR!=='undefined')Object.assign(FR,patch);}catch{}

  const reverse=new Map(Object.entries(patch).map(([ar,fr])=>[fr,ar]));
  const textOriginal=new WeakMap(),attrOriginal=new WeakMap();
  const arabic=/[\u0600-\u06ff]/;
  const attrs=['placeholder','title','aria-label','alt'];
  const preserve=(source,replacement)=>source.replace(source.trim(),replacement);

  function translateTextNode(node){
    if(!node?.nodeValue||!node.parentElement||['SCRIPT','STYLE','NOSCRIPT'].includes(node.parentElement.tagName))return;
    const raw=node.nodeValue,trimmed=raw.trim();if(!trimmed)return;
    if(locale==='fr'){
      if(arabic.test(trimmed)&&!textOriginal.has(node))textOriginal.set(node,raw);
      const mapped=(typeof FR!=='undefined'&&FR[trimmed])||patch[trimmed];
      if(mapped&&mapped!==trimmed)node.nodeValue=preserve(raw,mapped);
    }else{
      const original=textOriginal.get(node);
      if(original!==undefined){if(node.nodeValue!==original)node.nodeValue=original;return;}
      const mapped=reverse.get(trimmed);if(mapped)node.nodeValue=preserve(raw,mapped);
    }
  }
  function translateAttributes(el){
    if(!(el instanceof Element))return;
    let originals=attrOriginal.get(el);
    for(const attr of attrs){
      if(!el.hasAttribute(attr))continue;
      const current=el.getAttribute(attr)||'',trimmed=current.trim();if(!trimmed)continue;
      if(locale==='fr'){
        if(arabic.test(trimmed)){if(!originals){originals={};attrOriginal.set(el,originals);}if(!(attr in originals))originals[attr]=current;}
        const mapped=(typeof FR!=='undefined'&&FR[trimmed])||patch[trimmed];if(mapped)el.setAttribute(attr,mapped);
      }else if(originals&&attr in originals){el.setAttribute(attr,originals[attr]);}
      else if(reverse.has(trimmed))el.setAttribute(attr,reverse.get(trimmed));
    }
  }
  function localizeTree(root=document.body){
    if(!root)return;
    if(root.nodeType===Node.TEXT_NODE){translateTextNode(root);return;}
    if(root.nodeType!==Node.ELEMENT_NODE&&root!==document.body)return;
    if(root instanceof Element)translateAttributes(root);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))translateTextNode(node);
    if(root.querySelectorAll)root.querySelectorAll('*').forEach(translateAttributes);
  }
  function refreshLocaleRuntime(){
    document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr';
    localizeTree(document.body);
  }

  const baseToggle=toggleLocale;
  const enhancedToggle=()=>{baseToggle();refreshLocaleRuntime();requestAnimationFrame(refreshLocaleRuntime);setTimeout(refreshLocaleRuntime,60);};
  toggleLocale=enhancedToggle;
  if($('langToggle'))$('langToggle').onclick=enhancedToggle;
  if($('langToggle2'))$('langToggle2').onclick=enhancedToggle;

  const observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='characterData')translateTextNode(record.target);
      for(const node of record.addedNodes)localizeTree(node);
    }
  });
  if(document.body)observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  refreshLocaleRuntime();
})();
