import html2canvas from 'html2canvas';

export async function exportTableAsImage(el: HTMLElement, filename: string) {
  const raw = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
  const pad = 5 * 2; // 5px * scale(2) = 10 actual px on final canvas
  const padded = document.createElement('canvas');
  padded.width = raw.width + pad * 2;
  padded.height = raw.height + pad * 2;
  const ctx = padded.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, padded.width, padded.height);
  ctx.drawImage(raw, pad, pad);
  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = padded.toDataURL('image/png');
  link.click();
}
