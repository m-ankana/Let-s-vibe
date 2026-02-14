import React, { useState } from 'react';
import { User, Language, Scenario, AppView } from './types';
import { Login } from './components/Login';
import { LanguageSelector } from './components/LanguageSelector';
import { ChatInterface } from './components/ChatInterface';
import { generateScenario } from './services/geminiService';
import { Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('login');
  const [user, setUser] = useState<User | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<Language | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [previousScenarioContext, setPreviousScenarioContext] = useState<string>("");

  const handleLogin = (newUser: User) => {
    setUser(newUser);
    setView('select-language');
  };

  const handleLanguageSelect = async (lang: Language) => {
    if (!user) return;
    setSelectedLanguage(lang);
    setView('loading-scenario');
    
    // Generate scenario via Gemini, passing the previous context to ensure diversity
    const newScenario = await generateScenario(lang.name, user.name, previousScenarioContext);
    
    setScenario(newScenario);
    // Update context for the next round
    setPreviousScenarioContext(`${newScenario.title} - ${newScenario.description} (Location: ${newScenario.location}, Role: ${newScenario.aiRole})`);
    
    setView('chat');
  };

  const handleBackToLanguages = () => {
    setView('select-language');
    setScenario(null);
    setSelectedLanguage(null);
  };

  // Loading Screen for Scenario Generation
  if (view === 'loading-scenario') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <div className="relative">
          <div className="absolute inset-0 bg-indigo-200 rounded-full blur-xl opacity-50 animate-pulse"></div>
          <Loader2 className="w-16 h-16 text-indigo-600 animate-spin relative z-10" />
        </div>
        <h2 className="mt-8 text-2xl font-bold text-slate-800">Designing your experience...</h2>
        <p className="mt-2 text-slate-500 max-w-sm">
          Our AI is crafting a unique {selectedLanguage?.name} scenario just for you.
        </p>
      </div>
    );
  }

  // Views Router
  return (
    <>
      {view === 'login' && (
        <Login onLogin={handleLogin} />
      )}

      {view === 'select-language' && user && (
        <LanguageSelector 
          userName={user.name} 
          onSelectLanguage={handleLanguageSelect} 
        />
      )}

      {view === 'chat' && user && selectedLanguage && scenario && (
        <ChatInterface 
          user={user} 
          language={selectedLanguage} 
          scenario={scenario} 
          onBack={handleBackToLanguages}
        />
      )}
    </>
  );
};

export default App;