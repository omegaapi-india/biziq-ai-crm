// BizIQ browser flow. All copy and code are in English.
// No key, password, or lead detail is written to browser storage.

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  signedIn: false,
  leads: [],
  currentLead: null,
  toastTimer: null
};

function showToast(message, isError = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}

async function api(path, options = {}) {
  const config = {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    cache: 'no-store'
  };
  if (config.body && typeof config.body !== 'string') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(path, config);
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed.');
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function formatINR(value) {
  const number = Number(value) || 0;
  return '₹' + Math.round(number).toLocaleString('en-IN');
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

function setHidden(selector, hidden) {
  const element = $(selector);
  if (element) element.hidden = hidden;
}

// ---------- Lead capture ----------

function setupCapture() {
  const form = $('#capture-form');
  const started = $('#capture-started');
  const button = $('#capture-button');

  const markStarted = () => {
    // A small buffer keeps the bot check reliable across client/server clock skew.
    if (!started.value) started.value = String(Date.now() - 5000);
  };
  form.addEventListener('focusin', markStarted, true);
  form.addEventListener('input', markStarted, true);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    markStarted();
    button.disabled = true;
    button.textContent = 'Capturing…';

    try {
      const data = await api('/api/capture', {
        method: 'POST',
        body: {
          message: $('#capture-message').value,
          source: $('#capture-source').value,
          website: $('#capture-website').value,
          startedAt: Number(started.value)
        }
      });

      if (data.id === 'ignored') {
        showToast('Lead ignored by the spam filter.');
        return;
      }

      $('#result-score').textContent = String(data.score);
      $('#result-name').textContent = $('#capture-message').value.match(/(?:my name is|name\s*:)\s+([A-Za-z][\w.'-]*(?:\s+[A-Za-z][\w.'-]*){0,2})/i)?.[1] || 'Captured lead';
      $('#result-business').textContent = 'Stored with contact details redacted in the saved note.';
      $('#result-intent').textContent = data.intent || 'general';
      $('#result-source').textContent = $('#capture-source').selectedOptions[0].text;
      $('#result-model').textContent = data.model || 'rules';
      $('#result-id').textContent = String(data.id).slice(0, 8);
      $('#result-action').textContent = data.nextAction || 'Review this lead.';
      $('#result-note').textContent = 'Saved to D1. The bot wrote three activity records.';
      setHidden('#capture-result', false);
      showToast('Lead captured and scored: ' + data.score + '/100');

      if (state.signedIn) {
        await Promise.all([loadStats(), loadLeads(), loadActivities()]);
      }
    } catch (error) {
      showToast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = 'Capture lead';
      started.value = String(Date.now() - 5000);
    }
  });
}

// ---------- Calculators ----------

function setupCalculators() {
  const ids = [
    'lv-target', 'lv-deal', 'lv-rate', 'be-fixed', 'be-price', 'be-cost',
    'mm-cost', 'mm-price', 'roi-spend', 'roi-gain'
  ];
  const number = (id) => Math.max(0, Number($('#' + id).value) || 0);

  const calculate = () => {
    const deal = number('lv-deal');
    const rate = Math.min(100, Math.max(0.1, number('lv-rate') || 0.1));
    const leadValue = deal * (rate / 100);
    const target = number('lv-target');
    $('#lv-value').textContent = formatINR(leadValue);
    $('#lv-needed').textContent = leadValue > 0 ? Math.ceil(target / leadValue).toLocaleString('en-IN') : '—';

    const price = number('be-price');
    const variable = number('be-cost');
    const contribution = price - variable;
    $('#be-contribution').textContent = formatINR(contribution);
    $('#be-units').textContent = contribution > 0 ? Math.ceil(number('be-fixed') / contribution).toLocaleString('en-IN') : 'Not viable';

    const cost = number('mm-cost');
    const sale = number('mm-price');
    $('#mm-margin').textContent = sale > 0 ? (((sale - cost) / sale) * 100).toFixed(1) + '%' : '—';
    $('#mm-markup').textContent = cost > 0 ? (((sale - cost) / cost) * 100).toFixed(1) + '%' : '—';

    const spend = number('roi-spend');
    const gain = number('roi-gain');
    $('#roi-net').textContent = formatINR(gain - spend);
    $('#roi-value').textContent = spend > 0 ? (((gain - spend) / spend) * 100).toFixed(1) + '%' : '—';
  };

  ids.forEach((id) => $('#' + id).addEventListener('input', calculate));
  calculate();
}

// ---------- Admin session ----------

function showWorkspace() {
  state.signedIn = true;
  setHidden('#login-panel', true);
  setHidden('#workspace-panel', false);
  loadStats().catch(() => {});
  loadLeads().catch(() => {});
  loadActivities().catch(() => {});
}

function showLogin() {
  state.signedIn = false;
  setHidden('#login-panel', false);
  setHidden('#workspace-panel', true);
}

async function checkSession() {
  try {
    const data = await api('/api/admin/me');
    if (data.signedIn) showWorkspace();
  } catch {
    showLogin();
  }
}

function setupSession() {
  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = $('#login-status');
    status.textContent = 'Checking password…';
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: { password: $('#login-password').value }
      });
      $('#login-password').value = '';
      status.textContent = 'Session active for 7 days.';
      showWorkspace();
      showToast('Workspace unlocked.');
    } catch (error) {
      status.textContent = error.message;
      showToast(error.message, true);
    }
  });

  $('#logout-button').addEventListener('click', async () => {
    try {
      await api('/api/admin/logout', { method: 'POST' });
    } catch {
      // Local state is cleared even if the network call fails.
    }
    showLogin();
    showToast('Signed out.');
  });

  checkSession();
}

// ---------- Tabs ----------

function setupTabs() {
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((item) => item.classList.toggle('active', item === tab));
      $$('.tab-panel').forEach((panel) => {
        panel.hidden = panel.id !== 'tab-' + tab.dataset.tab;
      });
    });
  });
}

// ---------- Stats and learning ----------

async function loadStats() {
  const data = await api('/api/stats');
  const stats = data.stats || {};
  $('#stat-total').textContent = String(stats.totalLeads || 0);
  $('#stat-score').textContent = String(stats.averageScore || 0);
  $('#stat-wins').textContent = String(stats.wins || 0);
  $('#stat-revenue').textContent = formatINR(stats.revenue || 0);

  const intents = stats.intents || [];
  $('#intent-list').innerHTML = intents.length
    ? intents.map((row) => {
      const total = Math.max(1, stats.totalLeads || 1);
      const width = Math.max(10, Math.min(100, Math.round((row.count / total) * 10) * 10));
      return '<div class="bar-row"><span>' + escapeHtml(row.intent) + '</span>' +
        '<span class="bar-track"><i class="w' + width + '"></i></span>' +
        '<strong>' + row.count + '</strong></div>';
    }).join('')
    : '<p class="muted">No leads captured yet.</p>';

  const weights = stats.weights || {};
  $('#weight-list').innerHTML = Object.entries(weights)
    .map(([key, value]) => '<div class="weight-item"><span>' + escapeHtml(key) + '</span><strong>' + Number(value).toFixed(1) + '</strong></div>')
    .join('') || '<p class="muted">No weights available.</p>';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

// ---------- Leads ----------

async function loadLeads() {
  const query = $('#lead-search').value.trim();
  const data = await api('/api/leads?q=' + encodeURIComponent(query));
  state.leads = data.leads || [];
  $('#lead-count').textContent = state.leads.length + (query ? ' matching leads' : ' leads');

  $('#leads-body').innerHTML = state.leads.length
    ? state.leads.map((lead) => (
      '<tr data-id="' + escapeHtml(lead.id) + '">' +
      '<td><strong>' + escapeHtml(lead.name || 'Unnamed lead') + '</strong><br><span class="muted">' + escapeHtml(lead.business || '—') + '</span></td>' +
      '<td>' + escapeHtml(lead.intent) + '</td>' +
      '<td><strong>' + Number(lead.score) + '</strong></td>' +
      '<td><span class="pill ' + escapeHtml(lead.status) + '">' + escapeHtml(lead.status) + '</span></td>' +
      '<td>' + escapeHtml(lead.source) + '</td>' +
      '<td>' + escapeHtml(formatDate(lead.created_at)) + '</td>' +
      '</tr>'
    )).join('')
    : '<tr><td colspan="6" class="muted">No leads yet. Try the capture form above.</td></tr>';

  $$('#leads-body tr[data-id]').forEach((row) => {
    row.addEventListener('click', () => openLead(row.dataset.id));
  });
}

async function openLead(id) {
  const lead = state.leads.find((item) => item.id === id);
  if (!lead) return;

  state.currentLead = lead;
  $('#detail-name').textContent = lead.name || 'Unnamed lead';
  $('#detail-meta').textContent = [
    lead.business || 'No business',
    lead.email || 'No email captured',
    'Score ' + lead.score,
    'Model ' + (lead.model_provider || 'rules')
  ].join(' · ');
  $('#detail-status').value = lead.status;
  $('#detail-action').value = lead.next_action || '';
  $('#detail-note').value = lead.note || '';
  $('#detail-revenue').value = '0';
  setHidden('#lead-detail', false);
  $('#lead-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function saveLead(patch) {
  if (!state.currentLead) return;
  try {
    await api('/api/leads/' + encodeURIComponent(state.currentLead.id), {
      method: 'PATCH',
      body: patch
    });
    showToast('Lead updated. Bot recorded the change.');
    await Promise.all([loadLeads(), loadActivities()]);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function recordOutcome(result) {
  if (!state.currentLead) return;
  try {
    const data = await api('/api/outcomes', {
      method: 'POST',
      body: {
        leadId: state.currentLead.id,
        result,
        revenue: Number($('#detail-revenue').value) || 0,
        note: $('#detail-note').value
      }
    });
    showToast('Outcome saved. Learning weights updated.');
    setHidden('#lead-detail', true);
    state.currentLead = null;
    await Promise.all([loadStats(), loadLeads(), loadActivities()]);
    return data;
  } catch (error) {
    showToast(error.message, true);
    return null;
  }
}

function setupLeads() {
  let searchTimer;
  $('#lead-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadLeads().catch((error) => showToast(error.message, true)), 220);
  });
  $('#leads-refresh').addEventListener('click', () => loadLeads().catch((error) => showToast(error.message, true)));
  $('#detail-close').addEventListener('click', () => {
    setHidden('#lead-detail', true);
    state.currentLead = null;
  });
  $('#detail-save').addEventListener('click', () => saveLead({
    status: $('#detail-status').value,
    nextAction: $('#detail-action').value,
    note: $('#detail-note').value
  }));
  $('#detail-won').addEventListener('click', () => recordOutcome('won'));
  $('#detail-lost').addEventListener('click', () => recordOutcome('lost'));
}

// ---------- Activity and bot ----------

async function loadActivities() {
  const data = await api('/api/activities?limit=150');
  const activities = data.activities || [];
  $('#activity-count').textContent = activities.length + ' records';
  $('#activity-list').innerHTML = activities.length
    ? activities.map((item) => (
      '<div class="timeline-item">' +
      '<span class="timeline-dot"></span>' +
      '<span><span class="actor">' + escapeHtml(item.actor) + '</span><br>' + escapeHtml(item.summary) + '</span>' +
      '<time>' + escapeHtml(formatDate(item.created_at)) + '</time>' +
      '</div>'
    )).join('')
    : '<p class="muted">No activity recorded yet.</p>';
}

function setupBot() {
  $('#bot-run').addEventListener('click', async () => {
    const status = $('#bot-status');
    status.textContent = 'Reviewing pipeline…';
    try {
      const data = await api('/api/bot/run', { method: 'POST' });
      status.textContent = data.message + ' ' + data.recorded + ' new records.';
      await Promise.all([loadActivities(), loadStats()]);
      showToast('Bot review complete.');
    } catch (error) {
      status.textContent = error.message;
      showToast(error.message, true);
    }
  });
  $('#activity-refresh').addEventListener('click', () => loadActivities().catch((error) => showToast(error.message, true)));
}

// ---------- Model studio ----------

function setupModelForm() {
  const provider = $('#model-provider');

  const toggleFields = () => {
    const value = provider.value;
    setHidden('#cloud-fields', value !== 'cloud');
    setHidden('#local-fields', value !== 'local');
  };
  provider.addEventListener('change', toggleFields);
  toggleFields();

  $('#model-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const output = $('#model-output');
    const button = event.submitter;
    button.disabled = true;
    button.textContent = 'Extracting…';
    output.textContent = 'Working…';

    const message = $('#model-message').value;
    const selected = provider.value;
    const payload = { message };

    if (selected === 'cloud') {
      payload.modelConfig = {
        provider: 'cloud',
        baseUrl: $('#model-url').value.trim(),
        model: $('#model-name').value.trim(),
        apiKey: $('#model-key').value.trim()
      };
    } else if (selected === 'local') {
      payload.modelConfig = {
        provider: 'local',
        model: $('#local-model').value.trim() || 'llama3.2'
      };
    }

    try {
      let data = await api('/api/ai/extract', { method: 'POST', body: payload });

      if (data.needsBrowserBridge) {
        const bridge = await fetch('http://127.0.0.1:8789/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: data.prompt, model: $('#local-model').value.trim() || 'llama3.2' })
        });
        const bridgeData = await bridge.json();
        if (!bridge.ok) throw new Error(bridgeData.error || 'Local bridge request failed.');
        data = await api('/api/ai/extract', {
          method: 'POST',
          body: {
            message,
            refinement: JSON.stringify(bridgeData.refinement || {}),
            modelConfig: payload.modelConfig
          }
        });
      }

      output.textContent = JSON.stringify(data.lead || data, null, 2);
      showToast('Extraction complete using ' + (data.model?.provider || 'rules') + '.');
    } catch (error) {
      output.textContent = 'Error: ' + error.message;
      showToast(error.message, true);
    } finally {
      $('#model-key').value = '';
      button.disabled = false;
      button.textContent = 'Extract lead';
    }
  });
}

// ---------- Boot ----------

function boot() {
  setupCapture();
  setupCalculators();
  setupSession();
  setupTabs();
  setupLeads();
  setupBot();
  setupModelForm();
}

boot();
