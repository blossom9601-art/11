from pathlib import Path
import time

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


out = Path("work/dashboard-editor-widget-actions.png").resolve()

opts = Options()
opts.add_argument("--ignore-certificate-errors")
opts.add_argument("--allow-insecure-localhost")
opts.add_argument("--window-size=1600,950")
opts.add_argument("--force-device-scale-factor=1")

driver = webdriver.Chrome(options=opts)
try:
    wait = WebDriverWait(driver, 20)
    driver.get("https://192.168.56.108/login")
    wait.until(EC.presence_of_element_located((By.ID, "employee_id"))).send_keys("admin")
    driver.find_element(By.ID, "password").send_keys("admin1234!")
    driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
    wait.until(lambda d: "/login" not in d.current_url)

    dash_id = "55555555-5555-4555-8555-555555555555"
    driver.get(f"https://192.168.56.108/b/dashboard_builder/{dash_id}")
    wait.until(EC.presence_of_element_located((By.CLASS_NAME, "dw-full-create")))
    driver.execute_script(
        """
        const buttons = [...document.querySelectorAll('[data-start-dashboard]')];
        const target = buttons.find((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        target.click();
        """
    )
    wait.until(EC.presence_of_element_located((By.CLASS_NAME, "dw-editor-shell")))

    for label in ("KPI", "Line", "Bar"):
        wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, f'[data-editor-tool="{label}"]'))).click()
        time.sleep(0.2)

    wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".dw-editor-widget")) == 3)
    driver.find_elements(By.CSS_SELECTOR, ".dw-editor-widget")[1].click()
    time.sleep(0.5)

    data = driver.execute_script(
        """
        const widgets = [...document.querySelectorAll('.dw-editor-widget')].map((w) => {
          const r = w.getBoundingClientRect();
          return {
            title: w.querySelector('strong')?.textContent,
            selected: w.classList.contains('selected'),
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height)
          };
        });
        const empty = document.querySelector('.dw-editor-empty');
        const props = document.querySelector('.dw-editor-props')?.innerText || '';
        const css = [...document.querySelectorAll('link[rel="stylesheet"]')]
          .map((x) => x.href)
          .filter((x) => x.includes('dashboard_workspace'));
        return {
          url: location.href,
          css,
          widgetCount: widgets.length,
          widgets,
          emptyDisplay: empty ? getComputedStyle(empty).display : null,
          props
        };
        """
    )
    assert data["widgetCount"] == 3, data
    assert data["emptyDisplay"] == "none", data
    assert any(w["selected"] and w["title"] == "라인 차트" for w in data["widgets"]), data
    assert "라인 차트" in data["props"], data
    assert any("dashbuild9" in href for href in data["css"]), data
    driver.save_screenshot(str(out))
    print(data)
    print(out)
finally:
    driver.quit()
