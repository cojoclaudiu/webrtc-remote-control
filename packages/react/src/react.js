// eslint-disable-next-line import/no-extraneous-dependencies
import React, { useState } from "react";

export const useActive = () => {
  const [active, set] = useState(false);
  return {
    active,
    bind: {
      onMouseDown: () => set(true),
      onMouseUp: () => set(false),
    },
  };
};

export const HelloWorld = () => <div>Hello World</div>;