import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const EMPTY_ACCESS = {
  ownerUserId: '',
  role: '',
  isOwner: false,
};

const normalizeAccessRow = (row, currentUserId) => {
  const ownerUserId = String(row?.owner_user_id || '');
  if (!ownerUserId) throw new Error('The household finance owner could not be resolved.');

  return {
    ownerUserId,
    role: row?.role || (ownerUserId === currentUserId ? 'owner' : 'editor'),
    isOwner: row?.is_owner === true || ownerUserId === currentUserId,
  };
};

export function useFinanceHouseholdAccess({ currentUserId } = {}) {
  const [access, setAccess] = useState(EMPTY_ACCESS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!currentUserId) {
      setAccess(EMPTY_ACCESS);
      setError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data, error: accessError } = await supabase
        .rpc('get_my_finance_household_access')
        .single();
      if (accessError) throw accessError;
      setAccess(normalizeAccessRow(data, currentUserId));
    } catch (nextError) {
      setAccess(EMPTY_ACCESS);
      setError(nextError?.message || 'Unable to open the shared household plan.');
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    ...access,
    loading,
    error,
    reload: load,
  };
}
