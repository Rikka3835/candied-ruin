(async () => {
  const q = async () => (await (await fetch('https://candied-ruin.pages.dev/api/chapters')).json()).chapters.map(c => c.n + ':' + c.title).join(' | ');
  console.log('DB now:', await q());
})();
