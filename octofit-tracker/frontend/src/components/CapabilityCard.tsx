import { useEffect, useState } from 'react';
import { getJson } from '../api/client.js';

type Collection = 'activities' | 'teams' | 'leaderboard' | 'suggestions';
type ApiRecord = Record<string, unknown>;
type Props = { title: string; description: string; endpoint: string; collection: Collection };

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function displayValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(', ');
  return '';
}

const fields: Record<Collection, string[]> = {
  activities: ['type', 'minutes', 'points'],
  teams: ['name', 'mascot', 'members'],
  leaderboard: ['rank', 'teamName', 'totalPoints'],
  suggestions: ['title', 'focus', 'minutes', 'difficulty', 'reason'],
};

const emptyMessages: Record<Collection, string> = {
  activities: 'No activities yet.',
  teams: 'No teams yet.',
  leaderboard: 'No leaderboard rankings yet.',
  suggestions: 'No workout suggestions yet.',
};

export function CapabilityCard({ title, description, endpoint, collection }: Props) {
  const [items, setItems] = useState<ApiRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setItems(null);
    setError(null);
    getJson<unknown>(endpoint).then((payload) => {
      if (!isRecord(payload) || !Array.isArray(payload[collection])) {
        throw new Error('The API returned an unexpected response');
      }
      const records: ApiRecord[] = [];
      for (const item of payload[collection]) {
        if (!isRecord(item)) throw new Error('The API returned an unexpected response');
        records.push(item);
      }
      if (active) setItems(records);
    }).catch((requestError: unknown) => {
      if (!active) return;
      setError(requestError instanceof Error ? requestError.message : 'Unknown error');
    });
    return () => { active = false; };
  }, [collection, endpoint]);

  return <section className="card h-100"><div className="card-body">
    <h2 className="h4">{title}</h2>
    <p>{description}</p>
    {items === null && !error && <p role="status">Loading {title.toLowerCase()}...</p>}
    {error && <p role="alert">Unable to load {title.toLowerCase()}: {error}</p>}
    {items?.length === 0 && <p>{emptyMessages[collection]}</p>}
    {items && items.length > 0 && <ul className="list-group list-group-flush">
      {items.map((item, index) => {
        const key = typeof item._id === 'string' ? item._id : `${collection}-${index}`;
        return <li className="list-group-item" key={key}>
          {fields[collection].map((field) => {
            const value = displayValue(item[field]);
            return value ? <span className="me-3" key={field}>{value}</span> : null;
          })}
        </li>;
      })}
    </ul>}
  </div></section>;
}
