import React, { useState } from 'react';
import { User } from '../types';
import { Button } from './Button';
import { Sparkles } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onLogin({ name: name.trim() });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md border border-slate-100">
        <div className="flex justify-center mb-6">
          <div className="bg-indigo-100 p-4 rounded-full">
            <Sparkles className="w-8 h-8 text-indigo-600" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-center text-slate-800 mb-2">Welcome to LingoLoop</h1>
        <p className="text-center text-slate-500 mb-8">Your AI-powered immersive language journey.</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
              What should we call you?
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
              placeholder="Enter your name"
              required
            />
          </div>
          <Button type="submit" fullWidth disabled={!name.trim()}>
            Start Learning
          </Button>
        </form>
      </div>
    </div>
  );
};