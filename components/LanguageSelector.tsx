import React from 'react';
import { Language } from '../types';
import { SUPPORTED_LANGUAGES } from '../constants';
import { Globe } from 'lucide-react';

interface LanguageSelectorProps {
  userName: string;
  onSelectLanguage: (lang: Language) => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ userName, onSelectLanguage }) => {
  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">
            Hi {userName}, <span className="text-indigo-600">what language</span> do you want to learn today?
          </h2>
          <p className="text-slate-500 mt-2 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Select a language to generate a unique scenario
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              onClick={() => onSelectLanguage(lang)}
              className="group relative bg-white hover:bg-indigo-600 p-6 rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left border border-slate-100 hover:border-indigo-500"
            >
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform duration-300">
                {lang.flag}
              </div>
              <h3 className="text-lg font-bold text-slate-800 group-hover:text-white">
                {lang.name}
              </h3>
              <p className="text-sm text-slate-400 group-hover:text-indigo-100 mt-1">
                Say "{lang.hello}"
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};