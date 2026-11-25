import React from 'react';
import {Briefcase, Home} from 'lucide-react';

interface FavoriteSpotIconProps {
  type: 'home' | 'work';
  filled: boolean;
  className?: string;
}

export const FavoriteSpotIcon: React.FC<FavoriteSpotIconProps> = ({
  type,
  filled,
  className = 'h-4 w-4',
}) => {
  if (type === 'home') {
    if (filled) {
      return (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={className}
          aria-hidden="true"
        >
          <path d="M11.47 2.84a.75.75 0 0 1 1.06 0l8.25 7.5a.75.75 0 0 1-.51 1.3H19v8.11A1.25 1.25 0 0 1 17.75 21H14.5v-5.5a1 1 0 0 0-1-1h-3a1 1 0 0 0-1 1V21H6.25A1.25 1.25 0 0 1 5 19.75v-8.11H3.73a.75.75 0 0 1-.51-1.3l8.25-7.5Z" />
        </svg>
      );
    }
    return <Home className={className} aria-hidden="true" />;
  }

  if (filled) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M9 6V4.75C9 3.784 9.784 3 10.75 3h2.5C14.216 3 15 3.784 15 4.75V6h3.5A2.5 2.5 0 0 1 21 8.5v9.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18V8.5A2.5 2.5 0 0 1 5.5 6H9Zm1.5 0h3V4.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25V6Z"
        />
      </svg>
    );
  }
  return <Briefcase className={className} aria-hidden="true" />;
};
