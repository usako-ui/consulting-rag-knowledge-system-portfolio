'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/ui/cn';
import { pushRecentSearch } from './recent';

interface SearchBarProps {
  size?: 'md' | 'lg';
  placeholder?: string;
  defaultQuestion?: string;
}

export function SearchBar({
  size = 'md',
  placeholder = '質問を入力してください',
  defaultQuestion = '',
}: SearchBarProps) {
  const router = useRouter();
  const [question, setQuestion] = useState(defaultQuestion);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (trimmed.length === 0) return;
    pushRecentSearch(trimmed);
    const params = new URLSearchParams({ q: trimmed });
    router.push(`/search?${params.toString()}`);
  }

  const heights = size === 'lg' ? 'h-14 text-base' : 'h-11 text-sm';
  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'flex flex-col items-stretch gap-2 md:flex-row md:items-center md:gap-3',
      )}
    >
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          inputMode="search"
          maxLength={1000}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={placeholder}
          aria-label="質問"
          className={cn(
            'w-full rounded-inline border border-border bg-white pl-11 pr-4 text-text-primary placeholder:text-text-muted shadow-card transition-colors duration-150 focus:outline-none focus-visible:border-primary-accent',
            heights,
          )}
        />
      </div>
      <Button
        type="submit"
        size={size === 'lg' ? 'lg' : 'md'}
        className="md:min-w-[9rem]"
        disabled={question.trim().length === 0}
      >
        検索する
      </Button>
    </form>
  );
}
