/***********************************************************************************
Student in halls materials — crown / no-crown variants via ?crown=1|0
************************************************************************************/

(function () {
    const params = new URLSearchParams(window.location.search);
    const crown = params.get('crown') !== '0';
    const crownQuery = crown ? 'crown=1' : 'crown=0';
    const rootPath = '/prototypes/student-in-halls';

    document.querySelectorAll('[data-material]').forEach((img) => {
        const name = img.getAttribute('data-material');
        const fileName = crown ? `${name}-crown.png` : `${name}.png`;
        img.src = `${rootPath}/img/${fileName}`;
    });

    document.querySelectorAll('[data-materials-link]').forEach((link) => {
        const href = link.getAttribute('data-materials-link');
        const url = new URL(href, window.location.origin);
        url.searchParams.set('crown', crown ? '1' : '0');
        link.href = `${url.pathname}?${url.searchParams.toString()}`;
    });

    document.documentElement.dataset.materialsCrown = crown ? '1' : '0';
})();
