import React from 'react';

const Skeleton = React.memo(({ h = 16, w = '100%', rounded = 8 }) => (
  <div className="skeleton" style={{ height: h, width: w, borderRadius: rounded }} />
));
Skeleton.displayName = 'Skeleton';
export default Skeleton;
