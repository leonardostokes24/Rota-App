import React from 'react';

// You can replace this URL with any Bonzi Buddy GIF you find!
const BONZI_GIF_URL = 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmZ6Znd6Znd6Znd6Znd6Znd6Znd6Znd6Znd6Znd6Znd6Znd6Znd6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/l41lTjJpS5yA5n7S0/giphy.gif'; 

export const BonziBuddy: React.FC = () => {
  return (
    <div className="fixed bottom-6 right-6 z-50 pointer-events-none animate-bonzi">
      <img 
        src="https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNzhndmR6Znd6Znd6Znd6Znd6Znd6Znd6Znd6Znd6Znd6Znd6Znd6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/3o7TKMGpxvWvDndvXW/giphy.gif" 
        alt="Bonzi Buddy" 
        className="w-20 h-20 drop-shadow-2xl"
      />
    </div>
  );
};
