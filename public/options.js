const input = document.getElementById('backend');
const status = document.getElementById('status');
const saved = localStorage.getItem('stock_pro_api_base_url') || '';
input.value = saved;
document.getElementById('save').addEventListener('click', () => {
  const value = input.value.trim().replace(/\/+$/, '');
  if (!value) {
    localStorage.removeItem('stock_pro_api_base_url');
    status.textContent = 'Backend URL cleared. The extension needs a deployed backend to use server features.';
    return;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('Enter an HTTPS origin only, without a path, query or fragment.');
    }
    localStorage.setItem('stock_pro_api_base_url', parsed.origin);
    status.textContent = 'Backend URL saved.';
  } catch (error) {
    status.textContent = error.message || 'Enter a valid HTTPS origin.';
  }
});
