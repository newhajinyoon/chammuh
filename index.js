let nickname = '',
  lovePoint = {
    chammuh: 0,
    이름1: 0
  };

ctx.font = '22px Spoqa Han Sans';

confirm('이름이 뭐야?', 'nameInput', '홍길동', (id, reconfirm) => {
  nickname = document.getElementById(id).value;


  if (nickname == '') {
    alertErr('이름을 입력해줘!');
    return; 
  } else if (nickname === '참머') {
    alertErr('\'참머\' 는 사용할 수 없는 이름이야!');
    return;
  } else if (ctx.measureText(nickname).width > 150) {
    alertErr('조금 더 짧은 닉네임을 입력해줘! (한글 기준 최대 7자, 알파벳 기준 최대 12자)');
    return;
  }

  Promise.all([
    fetch('./assets/list.txt').then(res => res.text()),
    fetch('./scripts/script.json').then(res => res.json())
  ]).then(([assetListText, scriptJson]) => {

    preloading('./assets/', assetListText.split(', '));

    show('클릭하여 시작...', 'title', false);

    canvas.addEventListener('click', function startGame() {
      playScript(scriptJson);
    }, { once: true }); 

  }).catch(error => {
    console.error('게임 데이터 로딩 실패:', error);
    alertErr('게임을 시작하는 데 필요한 파일을 불러오지 못했습니다. 페이지를 새로고침 해주세요.');
  });
});


document.body.addEventListener('selectstart', () => {
  return false;
});