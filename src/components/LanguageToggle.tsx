import { useTranslation } from 'react-i18next'

export function LanguageToggle() {
  const { i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? 'en'
  const next = lang === 'ar' ? 'en' : 'ar'
  return (
    <button
      className="btn-outline px-3 py-1.5 text-xs"
      onClick={() => i18n.changeLanguage(next)}
      title="Toggle language"
    >
      {lang === 'ar' ? 'English' : 'العربية'}
    </button>
  )
}
