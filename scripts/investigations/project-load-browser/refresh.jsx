import React from 'react';
export default function Refresh({ onMembershipChanged }) {
  return <button onClick={() => void onMembershipChanged()} style={{ margin: 16 }}>Refresh synthetic project list</button>;
}
