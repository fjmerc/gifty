import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrochip, faExclamationTriangle, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import axiosInstance from '../../axiosInstance';
import styles from './AIProviderSelector.module.css';

/**
 * Lets the user pick an AI provider (OpenAI / Anthropic / Gemini /
 * whatever else the backend has keys for) and a specific model within
 * that provider. Providers without a configured API key are shown but
 * disabled, so users see what's possible vs. what's enabled.
 *
 * Props:
 *   provider, model — currently selected values (or '' for default)
 *   onChange({ provider, model }) — fired on any change
 *   activeProvider, activeModel — what the server will actually use
 *     (informational; shown below selectors)
 *   embedded — inside a section that already has the "AI Model" title
 *     (Settings): no card and no heading of its own
 */
const AIProviderSelector = ({ provider, model, onChange, activeProvider, activeModel, embedded = false }) => {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    axiosInstance.get('/ai/models')
      .then((res) => {
        if (cancelled) return;
        // Defensive: accept only payloads that look like the catalog
        // shape. If the endpoint is mocked or missing in tests, this
        // keeps the rest of the page rendering instead of crashing.
        const data = res?.data;
        if (data && Array.isArray(data.providers)) setCatalog(data);
        else setCatalog({ defaultProvider: 'openai', providers: [] });
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load AI models'); });
    return () => { cancelled = true; };
  }, []);

  const wrapperClass = embedded ? styles.embedded : styles.container;
  const header = embedded ? null : (
    <div className={styles.header}>
      <FontAwesomeIcon icon={faMicrochip} className={styles.icon} />
      <h3 className={styles.title}>AI Model</h3>
    </div>
  );

  if (error) {
    return (
      <div className={wrapperClass}>
        <div className={styles.warning}>
          <FontAwesomeIcon icon={faExclamationTriangle} /> {error}
        </div>
      </div>
    );
  }

  // While the catalog loads, render the same title and fields (disabled) so
  // the panel already has its final height and nothing below it moves.
  if (!catalog) {
    return (
      <div className={wrapperClass}>
        {header}
        <div className={styles.row}>
          <label className={styles.label}>
            <span>Provider</span>
            <select className={styles.select} value="" disabled>
              <option value="">Loading…</option>
            </select>
          </label>
          <label className={styles.label}>
            <span>Model</span>
            <select className={styles.select} value="" disabled>
              <option value="">Loading…</option>
            </select>
          </label>
        </div>
        <p className={styles.loading} role="status">Loading AI providers...</p>
      </div>
    );
  }

  const providers = Array.isArray(catalog.providers) ? catalog.providers : [];
  const currentProvider = provider || '';
  const selectedProviderObj = providers.find((p) => p.id === currentProvider);
  const modelOptions = selectedProviderObj?.models || [];

  const handleProviderChange = (e) => {
    const newProvider = e.target.value;
    // Reset model when provider changes — old model id won't exist on
    // the new provider.
    onChange({ provider: newProvider || null, model: null });
  };

  const handleModelChange = (e) => {
    onChange({ provider: currentProvider || null, model: e.target.value || null });
  };

  const noneConfigured = providers.length === 0 || providers.every((p) => !p.available);

  return (
    <div className={wrapperClass}>
      {header}

      {noneConfigured && (
        <div className={styles.warning}>
          <FontAwesomeIcon icon={faExclamationTriangle} /> No AI providers are configured on the server. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY.
        </div>
      )}

      <div className={styles.row}>
        <label className={styles.label}>
          <span>Provider</span>
          <select className={styles.select} value={currentProvider} onChange={handleProviderChange}>
            <option value="">Use server default ({catalog.defaultProvider || 'openai'})</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.available}>
                {p.label}{p.available ? '' : ' (not configured)'}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.label}>
          <span>Model</span>
          <select
            className={styles.select}
            value={model || ''}
            onChange={handleModelChange}
            disabled={!selectedProviderObj || !selectedProviderObj.available}
          >
            <option value="">Auto-select for mode</option>
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>

      {activeProvider && (
        <div className={styles.active}>
          <FontAwesomeIcon icon={faCheckCircle} /> Active: <strong>{activeProvider}</strong> / <strong>{activeModel}</strong>
        </div>
      )}

      {selectedProviderObj?.description && (
        <p className={styles.description}>{selectedProviderObj.description}</p>
      )}
    </div>
  );
};

export default AIProviderSelector;
