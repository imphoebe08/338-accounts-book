#!/usr/bin/env python3
import datetime
import json
import pathlib
import urllib.request

TWSE_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'
TPEX_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes'
OUTPUT_PATH = pathlib.Path(__file__).resolve().parents[1] / 'public' / 'stock-prices.json'


def fetch_json(url):
    request = urllib.request.Request(url, headers={
        'Accept': 'application/json',
        'User-Agent': '338-accounts-book stock snapshot updater',
    })
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode('utf-8'))


def parse_price(value):
    try:
        price = float(str(value).replace(',', '').strip())
        return price if price > 0 else None
    except (TypeError, ValueError):
        return None


def format_roc_date(value):
    raw = str(value or '').strip()
    if len(raw) != 7 or not raw.isdigit():
        return raw
    return f'{int(raw[:3]) + 1911}-{raw[3:5]}-{raw[5:7]}'


def main():
    prices = {}

    for row in fetch_json(TWSE_URL):
        symbol = str(row.get('Code', '')).strip().upper()
        price = parse_price(row.get('ClosingPrice'))
        if symbol and price:
            prices[symbol] = {
                'price': round(price, 2),
                'date': format_roc_date(row.get('Date')),
                'market': '上市',
            }

    for row in fetch_json(TPEX_URL):
        symbol = str(row.get('SecuritiesCompanyCode', '')).strip().upper()
        price = parse_price(row.get('Close'))
        if symbol and price:
            prices[symbol] = {
                'price': round(price, 2),
                'date': format_roc_date(row.get('Date')),
                'market': '上櫃',
            }

    payload = {
        'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'source': '臺灣證券交易所與證券櫃檯買賣中心公開資料',
        'prices': prices,
    }
    temporary_path = OUTPUT_PATH.with_suffix('.json.tmp')
    temporary_path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8',
    )
    temporary_path.replace(OUTPUT_PATH)
    print(f'Updated {len(prices)} official closing prices in {OUTPUT_PATH}')


if __name__ == '__main__':
    main()
