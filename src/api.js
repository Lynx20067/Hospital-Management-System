const BASE = 'http://localhost:5000/api';

export const getUser = () => JSON.parse(localStorage.getItem('hms_user') || 'null');
export const logout = () => { localStorage.removeItem('hms_user'); window.location.reload(); };

export async function api(path, method = 'GET', body) {
  const user = getUser();
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (res.status === 401 && path !== '/login') logout();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Download a file (such as a PDF invoice) from a protected route
export async function download(path, filename) {
  const user = getUser();
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${user.token}` } });
  if (!res.ok) throw new Error('Could not create the PDF.');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Open a protected PDF in a new browser tab
export async function view(path) {
  const user = getUser();
  const w = window.open('', '_blank'); // open now so the popup isn't blocked
  try {
    const res = await fetch(BASE + path + (path.includes('?') ? '&' : '?') + 'inline=1', { headers: { Authorization: `Bearer ${user.token}` } });
    if (!res.ok) throw new Error('Could not open the PDF.');
    const url = URL.createObjectURL(await res.blob());
    w.location = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { w?.close(); throw e; }
}
