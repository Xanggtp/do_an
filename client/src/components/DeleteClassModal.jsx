import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  Hash,
  LoaderCircle,
  ShieldAlert,
  Trash2,
  X
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext.jsx';

export function DeleteClassModal({
  isOpen,
  classItem,
  onClose,
  onConfirm,
  isBusy = false,
  error = ''
}) {
  const { t } = usePreferences();
  const [stage, setStage] = useState(1);
  const [confirmInput, setConfirmInput] = useState('');
  const inputRef = useRef(null);

  // Reset stage and input when modal opens or target class changes
  useEffect(() => {
    if (isOpen) {
      setStage(1);
      setConfirmInput('');
    }
  }, [isOpen, classItem?.id]);

  // Auto-focus input when transitioning to Stage 2
  useEffect(() => {
    if (isOpen && stage === 2) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, stage]);

  // Handle Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isBusy) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isBusy, onClose]);

  if (!isOpen || !classItem) return null;

  const targetName = (classItem.name || '').trim();
  const isMatched = confirmInput.trim() === targetName;

  const handleStage2Submit = (event) => {
    event.preventDefault();
    if (isMatched && !isBusy) {
      onConfirm(classItem);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy) {
          onClose();
        }
      }}
    >
      <div className="modal-container delete-modal">
        {/* Modal Top Bar */}
        <div className="modal-header">
          <div className="modal-header-info">
            <span className="eyebrow modal-eyebrow">
              {stage === 1 ? t('deleteClassStage1Eyebrow') : t('deleteClassStage2Eyebrow')}
            </span>
            <h2 id="delete-modal-title" className="modal-title">
              {stage === 1
                ? t('deleteClassStage1Title', { name: classItem.name })
                : t('deleteClassStage2Title')}
            </h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stepper Indicator */}
        <div className="delete-modal-stepper">
          <div className={`step-pill ${stage === 1 ? 'is-active' : 'is-complete'}`}>
            <span className="step-num">
              {stage > 1 ? <Check size={12} strokeWidth={3} /> : '1'}
            </span>
            <span className="step-text">{t('deleteClassStage1Subtitle')}</span>
          </div>
          <div className="step-connector" />
          <div className={`step-pill ${stage === 2 ? 'is-active' : ''}`}>
            <span className="step-num">2</span>
            <span className="step-text">{t('deleteClassStage2Subtitle')}</span>
          </div>
        </div>

        {/* STAGE 1: Impact Assessment */}
        {stage === 1 && (
          <div className="modal-body">
            {/* Class details badge */}
            <div className="delete-target-preview">
              <div className="target-icon">
                <BookOpen size={20} />
              </div>
              <div className="target-meta">
                <strong>{classItem.name}</strong>
                <div className="target-tags">
                  {classItem.subject && (
                    <span className="target-tag">
                      <BookOpen size={11} /> {classItem.subject}
                    </span>
                  )}
                  {classItem.classCode && (
                    <span className="target-tag">
                      <Hash size={11} /> {classItem.classCode}
                    </span>
                  )}
                  {classItem.semester && (
                    <span className="target-tag">
                      <Calendar size={11} /> {classItem.semester}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Impact Warning Box */}
            <div className="danger-warning-box">
              <div className="danger-warning-heading">
                <AlertTriangle size={17} />
                <strong>{t('deleteClassStage1Warning')}</strong>
              </div>
              <ul className="danger-impact-list">
                <li>{t('deleteClassImpact1')}</li>
                <li>{t('deleteClassImpact2')}</li>
                <li>{t('deleteClassImpact3')}</li>
              </ul>
            </div>

            {error && <div className="form-alert">{error}</div>}

            {/* Modal Actions */}
            <div className="modal-actions">
              <button
                type="button"
                className="outline-button"
                onClick={onClose}
                disabled={isBusy}
              >
                {t('deleteClassClose')}
              </button>
              <button
                type="button"
                className="danger-continue-button"
                onClick={() => setStage(2)}
              >
                <span>{t('deleteClassContinue')}</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* STAGE 2: Explicit Verification */}
        {stage === 2 && (
          <form className="modal-body" onSubmit={handleStage2Submit}>
            <div className="verification-callout">
              <div className="verification-icon">
                <ShieldAlert size={20} />
              </div>
              <div>
                <p className="verification-prompt">
                  {t('deleteClassStage2Prompt')}
                </p>
                <div className="verification-target-badge">
                  <strong>{classItem.name}</strong>
                </div>
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="confirm-class-name">
                {t('classNameLabel')}
              </label>
              <input
                id="confirm-class-name"
                ref={inputRef}
                className={`input verification-input ${isMatched ? 'is-valid' : ''}`}
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={t('deleteClassStage2Placeholder')}
                autoComplete="off"
                disabled={isBusy}
              />
              <div className="verification-feedback">
                {isMatched ? (
                  <span className="match-status valid">
                    <Check size={13} strokeWidth={3} /> {t('deleteClassStage2Match')}
                  </span>
                ) : (
                  <span className="match-status muted">
                    {t('deleteClassStage2Mismatch')}
                  </span>
                )}
              </div>
            </div>

            {error && <div className="form-alert">{error}</div>}

            <div className="modal-actions">
              <button
                type="button"
                className="outline-button"
                onClick={() => setStage(1)}
                disabled={isBusy}
              >
                <ArrowLeft size={15} />
                <span>{t('deleteClassBack')}</span>
              </button>
              <button
                type="submit"
                className="danger-confirm-button"
                disabled={!isMatched || isBusy}
              >
                {isBusy ? (
                  <>
                    <LoaderCircle className="spin" size={16} />
                    <span>{t('deleteClassDeleting')}</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>{t('deleteClassConfirmAction')}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
