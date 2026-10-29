import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  LoaderCircle,
  ShieldAlert,
  Trash2,
  X
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext.jsx';

export function DeleteSemesterModal({
  isOpen,
  semesterItem,
  classesCount = 0,
  classesList = [],
  onClose,
  onConfirm,
  isBusy = false,
  error = ''
}) {
  const { t } = usePreferences();
  const [stage, setStage] = useState(1);
  const [confirmInput, setConfirmInput] = useState('');
  const inputRef = useRef(null);

  // Reset stage and input when modal opens or target changes
  useEffect(() => {
    if (isOpen) {
      setStage(1);
      setConfirmInput('');
    }
  }, [isOpen, semesterItem?.id, semesterItem?.code]);

  // Auto-focus input when moving to Stage 2
  useEffect(() => {
    if (isOpen && stage === 2) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, stage]);

  // Handle Escape key
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

  if (!isOpen || !semesterItem) return null;

  const targetCode = (semesterItem.code || '').trim();
  const isMatched = confirmInput.trim() === targetCode;

  const handleStage2Submit = (event) => {
    event.preventDefault();
    if (isMatched && !isBusy) {
      onConfirm(semesterItem);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-semester-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy) {
          onClose();
        }
      }}
    >
      <div className="modal-container delete-modal">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-info">
            <span className="eyebrow modal-eyebrow">
              {stage === 1 ? t('deleteSemesterStage1Eyebrow') : t('deleteSemesterStage2Eyebrow')}
            </span>
            <h2 id="delete-semester-title" className="modal-title">
              {stage === 1
                ? t('deleteSemesterStage1Title', { code: targetCode })
                : t('deleteSemesterStage2Title')}
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

        {/* Stepper */}
        <div className="delete-modal-stepper">
          <div className={`step-pill ${stage === 1 ? 'is-active' : 'is-complete'}`}>
            <span className="step-num">
              {stage > 1 ? <Check size={12} strokeWidth={3} /> : '1'}
            </span>
            <span className="step-text">{t('deleteSemesterStage1Subtitle')}</span>
          </div>
          <div className="step-connector" />
          <div className={`step-pill ${stage === 2 ? 'is-active' : ''}`}>
            <span className="step-num">2</span>
            <span className="step-text">{t('deleteSemesterStage2Subtitle')}</span>
          </div>
        </div>

        {/* STAGE 1: Impact Assessment */}
        {stage === 1 && (
          <div className="modal-body">
            {/* Target preview */}
            <div className="delete-target-preview">
              <div className="target-icon">
                <Calendar size={20} />
              </div>
              <div className="target-meta">
                <strong>{t('academicSemester')}: {targetCode}</strong>
                <div className="target-tags">
                  <span className="target-tag">
                    <BookOpen size={11} /> {classesCount} {t('activeClasses')}
                  </span>
                </div>
              </div>
            </div>

            {/* List classes in this semester if any */}
            {classesList && classesList.length > 0 && (
              <div className="semester-classes-summary">
                <span className="classes-summary-label">{t('yourClasses')}:</span>
                <div className="semester-classes-chips">
                  {classesList.slice(0, 5).map((cls) => (
                    <span key={cls.id} className="summary-chip">
                      {cls.name}
                    </span>
                  ))}
                  {classesList.length > 5 && (
                    <span className="summary-chip more">
                      +{classesList.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Impact Warning */}
            <div className="danger-warning-box">
              <div className="danger-warning-heading">
                <AlertTriangle size={17} />
                <strong>{t('deleteSemesterStage1Warning')}</strong>
              </div>
              <ul className="danger-impact-list">
                <li>{t('deleteSemesterImpact1', { count: classesCount })}</li>
                <li>{t('deleteSemesterImpact2')}</li>
                <li>{t('deleteSemesterImpact3')}</li>
              </ul>
            </div>

            {error && <div className="form-alert">{error}</div>}

            {/* Actions */}
            <div className="modal-actions">
              <button
                type="button"
                className="outline-button"
                onClick={onClose}
                disabled={isBusy}
              >
                {t('deleteSemesterClose')}
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

        {/* STAGE 2: Verification Check */}
        {stage === 2 && (
          <form className="modal-body" onSubmit={handleStage2Submit}>
            <div className="verification-callout">
              <div className="verification-icon">
                <ShieldAlert size={20} />
              </div>
              <div>
                <p className="verification-prompt">
                  {t('deleteSemesterStage2Prompt')}
                </p>
                <div className="verification-target-badge">
                  <strong>{targetCode}</strong>
                </div>
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="confirm-semester-code">
                {t('academicSemester')}
              </label>
              <input
                id="confirm-semester-code"
                ref={inputRef}
                className={`input verification-input ${isMatched ? 'is-valid' : ''}`}
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={t('deleteSemesterStage2Placeholder')}
                autoComplete="off"
                disabled={isBusy}
              />
              <div className="verification-feedback">
                {isMatched ? (
                  <span className="match-status valid">
                    <Check size={13} strokeWidth={3} /> {t('deleteSemesterStage2Match')}
                  </span>
                ) : (
                  <span className="match-status muted">
                    {t('deleteSemesterStage2Mismatch')}
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
                    <span>{t('deleteSemesterDeleting')}</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>{t('deleteSemesterConfirmAction')}</span>
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
