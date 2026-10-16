import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRobot, faGlobe, faWandMagicSparkles, faLayerGroup, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import styles from './SuggestionModeSelector.module.css';

const SuggestionModeSelector = ({
  selectedMode,
  onModeChange,
  interactionCount = 0,
  systemHealth = null
}) => {
  // Enhanced still benefits from feedback history but works fine
  // without it — the prompt and re-ranker degrade gracefully. Surface
  // it immediately so new users can use the better-quality mode.
  const hasFeedbackBoost = interactionCount >= 3;
  const isSystemHealthy = Boolean(systemHealth?.isHealthy);
  const minLibrarySize = systemHealth?.minLibrarySize ?? 100;

  const modes = [
    {
      id: 'basic',
      label: 'Basic AI',
      description: 'Fast, AI-powered suggestions based on recipient preferences',
      icon: faRobot,
      details: 'Instant results using our core AI',
      speed: 'Fastest',
      accuracy: 'Good',
    },
    {
      id: 'enhanced',
      label: 'Enhanced AI',
      description: hasFeedbackBoost
        ? 'Improved suggestions using your interaction history'
        : 'Improved suggestions — gets even better as you rate gifts',
      icon: faWandMagicSparkles,
      details: 'Personalized recommendations with feedback-aware re-ranking',
      speed: 'Fast',
      accuracy: hasFeedbackBoost ? 'Better' : 'Better (limited feedback)',
    },
    {
      id: 'web',
      label: 'Web-Enhanced',
      description: 'AI suggestions checked against a web search',
      icon: faGlobe,
      details: 'With links to related pages it found. Prices are AI estimates.',
      speed: 'Moderate',
      // The same AI step as Enhanced; the web search adds links, not accuracy
      accuracy: hasFeedbackBoost ? 'Better' : 'Better (limited feedback)',
    },
    {
      id: 'hybrid',
      label: 'Hybrid Mode',
      description: 'Most comprehensive suggestions from all sources',
      icon: faLayerGroup,
      details: 'Combines AI, web data, and our gift library',
      speed: 'Slower',
      accuracy: 'Most Complete',
      // Unknown health (still loading) shows no warning; only a known small
      // library does, so the warning never flashes before the data is in
      warning: systemHealth && !isSystemHealthy
        ? `Limited mode: Only ${systemHealth?.giftCount ?? 0}/${minLibrarySize} gifts in library`
        : null,
    },
  ];

  const activeMode = modes.find(mode => mode.id === selectedMode);

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Suggestion Mode</h3>
      <div className={styles.modeGrid} role="radiogroup" aria-label="Suggestion mode">
        {modes.map(mode => (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={selectedMode === mode.id}
            className={`${styles.modeOption} ${selectedMode === mode.id ? styles.selected : ''}`}
            onClick={() => onModeChange(mode.id)}
          >
            <FontAwesomeIcon icon={mode.icon} className={styles.modeIcon} />
            <span className={styles.modeLabel}>{mode.label}</span>
            {mode.warning && (
              <FontAwesomeIcon
                icon={faExclamationTriangle}
                className={styles.modeWarningIcon}
                title={mode.warning}
              />
            )}
          </button>
        ))}
      </div>
      {activeMode && (
        <div className={styles.detailPanel}>
          <p className={styles.modeDescription}>{activeMode.description}</p>
          <p className={styles.modeDetails}>{activeMode.details}</p>
          <p className={styles.modeMeta}>
            <span><strong>Speed:</strong> {activeMode.speed}</span>
            <span><strong>Accuracy:</strong> {activeMode.accuracy}</span>
          </p>
          {activeMode.warning && (
            <div className={styles.warning}>
              <FontAwesomeIcon icon={faExclamationTriangle} />
              <span>{activeMode.warning}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SuggestionModeSelector;
