import { Request, Response } from 'express';

type GoldPriceQuote = {
  provider: 'vang.today';
  typeCode: string;
  buy: number;
  sell: number;
  changeBuy: number;
  changeSell: number;
  vndPerLuong: number;
  vndPerChi: number;
  vndPerGram: number;
  updatedAt: string;
  fetchedAt: string;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const goldCache = new Map<string, { expiresAt: number; quote: GoldPriceQuote }>();

function sanitizeTypeCode(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  const cleaned = trimmed.replace(/[^a-zA-Z0-9_]/g, '');
  return cleaned || fallback;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    const parsed = Number(normalized);
    return parsed;
  }
  return NaN;
}

export class MarketPricesController {
  getGoldCurrent = async (request: Request, response: Response): Promise<void> => {
    const typeCode = sanitizeTypeCode(request.query.type, 'SJL1L10');
    const now = Date.now();
    const cached = goldCache.get(typeCode);
    if (cached && cached.expiresAt > now) {
      response.json(cached.quote);
      return;
    }

    try {
      const upstream = await fetch(`https://www.vang.today/api/prices?type=${encodeURIComponent(typeCode)}`);
      if (!upstream.ok) {
        response.status(502).json({ message: 'Không lấy được giá vàng hiện tại' });
        return;
      }

      const payload = (await upstream.json()) as Record<string, unknown>;

      const pickFromRoot = (): { buy: number; sell: number; changeBuy: number; changeSell: number; timestamp: number | null } | null => {
        if (!('buy' in payload) || !('sell' in payload)) {
          return null;
        }
        const buy = toNumber(payload.buy);
        const sell = toNumber(payload.sell);
        const changeBuy = toNumber(payload.change_buy ?? 0);
        const changeSell = toNumber(payload.change_sell ?? 0);
        const timestamp = toNumber(payload.timestamp ?? payload.current_time);
        return {
          buy,
          sell,
          changeBuy: Number.isFinite(changeBuy) ? changeBuy : 0,
          changeSell: Number.isFinite(changeSell) ? changeSell : 0,
          timestamp: Number.isFinite(timestamp) ? timestamp : null,
        };
      };

      const pickFromPricesMap = (): { buy: number; sell: number; changeBuy: number; changeSell: number; timestamp: number | null } | null => {
        const prices = payload.prices;
        if (!prices || typeof prices !== 'object' || Array.isArray(prices)) {
          return null;
        }
        const entry = (prices as Record<string, unknown>)[typeCode];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return null;
        }
        const buy = toNumber((entry as Record<string, unknown>).buy);
        const sell = toNumber((entry as Record<string, unknown>).sell);
        const changeBuy = toNumber((entry as Record<string, unknown>).change_buy ?? 0);
        const changeSell = toNumber((entry as Record<string, unknown>).change_sell ?? 0);
        const timestamp = toNumber(payload.timestamp ?? payload.current_time);
        return {
          buy,
          sell,
          changeBuy: Number.isFinite(changeBuy) ? changeBuy : 0,
          changeSell: Number.isFinite(changeSell) ? changeSell : 0,
          timestamp: Number.isFinite(timestamp) ? timestamp : null,
        };
      };

      const pickFromLegacyArray = (): { buy: number; sell: number; changeBuy: number; changeSell: number; timestamp: number | null } | null => {
        const data = payload.data;
        if (!Array.isArray(data) || data.length === 0) {
          return null;
        }
        const first = data[0] as Record<string, unknown> | undefined;
        const buy = toNumber(first?.buy);
        const sell = toNumber(first?.sell);
        const changeBuy = toNumber(first?.change_buy ?? 0);
        const changeSell = toNumber(first?.change_sell ?? 0);
        const timestamp = toNumber(first?.update_time ?? payload.current_time ?? payload.timestamp);
        return {
          buy,
          sell,
          changeBuy: Number.isFinite(changeBuy) ? changeBuy : 0,
          changeSell: Number.isFinite(changeSell) ? changeSell : 0,
          timestamp: Number.isFinite(timestamp) ? timestamp : null,
        };
      };

      const picked = pickFromRoot() ?? pickFromPricesMap() ?? pickFromLegacyArray();
      const buy = picked ? picked.buy : NaN;
      const sell = picked ? picked.sell : NaN;
      const changeBuy = picked ? picked.changeBuy : 0;
      const changeSell = picked ? picked.changeSell : 0;
      const timestamp = picked ? picked.timestamp : null;
      const sellOrBuy = Number.isFinite(sell) && sell > 0 ? sell : buy;

      if (!Number.isFinite(buy) || !Number.isFinite(sellOrBuy) || sellOrBuy <= 0) {
        response.status(502).json({ message: 'Dữ liệu giá vàng không hợp lệ' });
        return;
      }

      const vndPerLuong = Math.round(sellOrBuy);
      const vndPerChi = Math.round(sellOrBuy / 10);
      const vndPerGram = Math.round(sellOrBuy / 37.5);
      const updatedAt = timestamp != null ? new Date(timestamp * 1000).toISOString() : new Date().toISOString();
      const fetchedAt = new Date().toISOString();

      const quote: GoldPriceQuote = {
        provider: 'vang.today',
        typeCode,
        buy: Math.round(buy),
        sell: Math.round(sellOrBuy),
        changeBuy: Math.round(changeBuy),
        changeSell: Math.round(Number.isFinite(sell) && sell > 0 ? changeSell : changeBuy),
        vndPerLuong,
        vndPerChi,
        vndPerGram,
        updatedAt,
        fetchedAt,
      };

      goldCache.set(typeCode, { expiresAt: now + CACHE_TTL_MS, quote });
      response.json(quote);
    } catch {
      response.status(502).json({ message: 'Không lấy được giá vàng hiện tại' });
    }
  };
}
