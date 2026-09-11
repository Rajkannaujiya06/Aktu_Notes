/* Supabase-backed catalogue and admin functions. This file intentionally runs
   after the legacy UI scripts so the production backend replaces browser-only data. */
(async () => {
  const config = window.AKTU_SUPABASE_CONFIG;
  if (!config || !window.supabase) return;
  const client = window.supabase.createClient(config.url, config.publishableKey);
  const el = selector => document.querySelector(selector);
  const safe = value => String(value || '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[c]);
  const fail = error => {
    console.error(error);
    const message = error?.message?.toLowerCase().includes('public.profiles')
      ? 'Supabase setup incomplete hai. SQL Editor me supabase/schema.sql ka poora code run karein, phir page refresh karein.'
      : error?.message || 'Something went wrong. Please try again.';
    toast(message);
  };
  let records = { years: [], subjects: [], units: [] };
  const labelYear = name => {
    const n = String(name).match(/\d+/)?.[0];
    return ({ 1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year' })[n] || name;
  };
  const makeCurriculum = () => Object.fromEntries(records.years.map(year => [year.name,
    Object.fromEntries(records.subjects.filter(subject => subject.year_id === year.id).map(subject => [subject.name,
      records.units.filter(unit => unit.subject_id === subject.id).sort((a, b) => a.sort_order - b.sort_order).map(unit => unit.name)
    ]))
  ]));
  const loadCatalogue = async () => {
    const [yearsResult, subjectsResult, unitsResult, notesResult] = await Promise.all([
      client.from('years').select('*').order('sort_order'),
      client.from('subjects').select('*').order('created_at'),
      client.from('units').select('*').order('sort_order'),
      client.from('notes').select('*').order('created_at', { ascending: false })
    ]);
    const error = [yearsResult, subjectsResult, unitsResult, notesResult].find(result => result.error)?.error;
    if (error) throw error;
    records = { years: yearsResult.data, subjects: subjectsResult.data, units: unitsResult.data };
    curriculum = makeCurriculum();
    notes = notesResult.data.map(note => {
      const subject = records.subjects.find(item => item.id === note.subject_id);
      const year = records.years.find(item => item.id === subject?.year_id);
      const unit = records.units.find(item => item.id === note.unit_id);
      return { ...note, semester: year?.name || '', subject: subject?.name || '', unit: unit?.name || '', detail: 'PDF study material', pages: 'PDF', popularity: Date.parse(note.created_at) || 0 };
    });
    renderManager(); renderNotes();
  };
  const isAdmin = async () => {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return false;
    const { data, error } = await client.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (error) throw error;
    return Boolean(data?.is_admin);
  };
  const setAdminVisibility = async () => {
    try {
      const visible = await isAdmin();
      document.querySelectorAll('.admin-trigger').forEach(button => {
        button.hidden = !visible;
        button.setAttribute('aria-hidden', String(!visible));
      });
    } catch {
      document.querySelectorAll('.admin-trigger').forEach(button => { button.hidden = true; button.setAttribute('aria-hidden', 'true'); });
    }
  };
  const setAuthError = message => { const error = el('#adminAuthError'); error.textContent = message; error.hidden = !message; };
  const authDialog = el('#adminAuthDialog');
  el('#adminAuthForm').onsubmit = async event => {
    event.preventDefault(); setAuthError('');
    const email = el('#adminEmail').value.trim(); const password = el('#adminPassword').value;
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      const message = error.message?.toLowerCase().includes('email not confirmed')
        ? 'Email confirm nahi hua hai. Inbox ya spam folder me Supabase ka confirmation link open karein, phir sign in karein.'
        : error.message;
      return setAuthError(message);
    }
    try {
      if (!await isAdmin()) { await client.auth.signOut(); return setAuthError('This account is not an administrator.'); }
      authDialog.close(); renderManager(); el('#adminDialog').showModal();
    } catch (error) {
      const message = error?.message?.toLowerCase().includes('public.profiles')
        ? 'Admin portal ke liye pehle Supabase SQL Editor me supabase/schema.sql ka poora code run karein.'
        : error?.message || 'Admin access check nahi ho saka.';
      setAuthError(message);
    }
  };
  el('#adminSignup').onclick = async event => {
    event.preventDefault(); setAuthError('');
    const email = el('#adminEmail').value.trim(); const password = el('#adminPassword').value;
    if (!email || !password) return setAuthError('Enter an email address and password first.');
    const { error } = await client.auth.signUp({ email, password });
    if (error) return setAuthError(error.message);
    setAuthError('Account ban gaya. Inbox ya spam folder me confirmation link open karein, phir sign in karein. Uske baad Supabase SQL Editor me is account ko admin mark karein.');
  };
  el('#resendConfirmation').onclick = async () => {
    setAuthError('');
    const email = el('#adminEmail').value.trim();
    if (!email) return setAuthError('Pehle email address enter karein.');
    const { error } = await client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: window.location.href } });
    if (error) return setAuthError(error.message);
    setAuthError('Confirmation email dobara bhej diya gaya hai. Inbox aur spam folder check karein.');
  };
  document.querySelectorAll('.admin-trigger').forEach(button => button.onclick = async () => {
    try { if (await isAdmin()) { renderManager(); el('#adminDialog').showModal(); } else { setAuthError(''); el('#adminPassword').value = ''; authDialog.showModal(); el('#adminEmail').focus(); } } catch (error) { fail(error); }
  });
  await setAdminVisibility();
  client.auth.onAuthStateChange(() => { setTimeout(setAdminVisibility, 0); });
  if (window.location.hash === '#admin') {
    authDialog.showModal();
    el('#adminEmail').focus();
  }
  el('#addSubjectForm').onsubmit = async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const year = records.years.find(item => item.name === form.get('semester'));
    if (!year) return toast('Select a valid year.');
    const { error } = await client.from('subjects').insert({ year_id: year.id, name: form.get('subject').trim() });
    if (error) return fail(error); event.currentTarget.reset(); await loadCatalogue(); toast('Subject added.');
  };
  el('#addUnitForm').onsubmit = async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const year = records.years.find(item => item.name === form.get('semester'));
    const subject = records.subjects.find(item => item.year_id === year?.id && item.name === form.get('subject'));
    if (!subject) return toast('Select a valid subject.');
    const { error } = await client.from('units').insert({ subject_id: subject.id, name: form.get('unit').trim(), sort_order: records.units.filter(item => item.subject_id === subject.id).length + 1 });
    if (error) return fail(error); event.currentTarget.reset(); await loadCatalogue(); toast('Unit added.');
  };
  el('#curriculumList').onclick = async event => {
    const button = event.target.closest('[data-kind]'); if (!button || button.dataset.kind === 'semester') return;
    const year = records.years.find(item => item.name === button.dataset.sem);
    const subject = records.subjects.find(item => item.year_id === year?.id && item.name === button.dataset.sub);
    const unit = records.units.find(item => item.subject_id === subject?.id && item.name === button.dataset.unit);
    const target = button.dataset.kind === 'subject' ? ['subjects', subject?.id] : ['units', unit?.id];
    if (!target[1] || !confirm(`Delete this ${button.dataset.kind}? Related notes will also be removed from the catalogue.`)) return;
    const { error } = await client.from(target[0]).delete().eq('id', target[1]);
    if (error) return fail(error); await loadCatalogue(); toast('Deleted.');
  };
  const setProgress = (percent, message) => { el('#uploadStatus').hidden = false; el('#uploadPercent').textContent = `${percent}%`; el('#uploadProgressBar').style.width = `${percent}%`; el('#uploadMessage').textContent = message; };
  el('#uploadForm').onsubmit = async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const file = form.get('file');
    if (!(file instanceof File) || !file.size) return toast('Select a PDF file.');
    if (file.type !== 'application/pdf') return toast('Only PDF files can be uploaded.');
    const year = records.years.find(item => item.name === form.get('semester'));
    const subject = records.subjects.find(item => item.year_id === year?.id && item.name === form.get('subject'));
    const unit = records.units.find(item => item.subject_id === subject?.id && item.name === form.get('unit'));
    if (!subject) return toast('Select a subject first.');
    const path = `${year.id}/${subject.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    el('#uploadFileName').textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    setProgress(15, 'Uploading PDF to secure storage…');
    const { error: uploadError } = await client.storage.from('notes').upload(path, file, { contentType: 'application/pdf', upsert: false });
    if (uploadError) return fail(uploadError);
    setProgress(80, 'Saving note details…');
    const { error: noteError } = await client.from('notes').insert({ title: form.get('title').trim(), subject_id: subject.id, unit_id: unit?.id || null, storage_path: path, file_name: file.name, file_size: file.size });
    if (noteError) { await client.storage.from('notes').remove([path]); return fail(noteError); }
    setProgress(100, 'Upload complete — students can view and download it now.');
    await loadCatalogue(); toast('Note uploaded successfully.'); setTimeout(() => { el('#adminDialog').close(); event.currentTarget.reset(); }, 900);
  };
  openNote = async id => {
    const note = notes.find(item => String(item.id) === String(id)); if (!note) return;
    el('#noteViewer').innerHTML = `<div class="viewer-top"><span class="course-tag">${safe(labelYear(note.semester))} · ${safe(note.subject)}</span><h3>${safe(note.title)}</h3><p>${safe(note.unit || 'General')} · PDF</p><div class="viewer-actions"><button class="primary-cta" id="downloadNote">Download PDF <span>↓</span></button></div></div><div class="pdf-sheet"><b>${safe(note.title)}</b>Ready to view or download.</div>`;
    el('#noteDialog').showModal();
    el('#downloadNote').onclick = () => {
      const { data } = client.storage.from('notes').getPublicUrl(note.storage_path);
      const link = Object.assign(document.createElement('a'), { href: data.publicUrl, target: '_blank', rel: 'noopener', download: note.file_name }); link.click(); toast(`Download started: ${note.title}`);
    };
  };
  window.downloadNoteById = async id => {
    const note = notes.find(item => String(item.id) === String(id)); if (!note) return toast('Note nahi mili.');
    const { data, error } = await client.storage.from('notes').download(note.storage_path);
    if (error || !data) return toast('PDF download nahi ho saki.');
    const url = URL.createObjectURL(data);
    const link = Object.assign(document.createElement('a'), { href: url, download: note.file_name || `${note.title}.pdf` });
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast(`Download started: ${note.title}`);
    el('#unitDownloadDialog')?.close();
  };
  try { await loadCatalogue(); } catch (error) { console.warn('Supabase is not ready yet.', error); }
})();
