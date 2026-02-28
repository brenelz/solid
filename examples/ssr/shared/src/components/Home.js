import { createSignal, Loading, onSettled } from "solid-js";
const Home = () => {
  const [s, set] = createSignal(0);
  onSettled(() => {
    const t = setInterval(() => {
      const newVal = s() + 1;
      set(newVal);
    }, 100);
    return () => {
      clearInterval(t);
    };
  });
  return (
    <Wrapper>
      <Loading>
        <h1>Welcome to this Simple Routing Example</h1>
        <p>Click the links in the Navigation above to load different routes.</p>
        <span>{s()}</span>
        <Counter />
      </Loading>
    </Wrapper>
  );
};

function Wrapper(props) {
  return <>{props.children}</>;
}

function Counter() {
  const [count, setCount] = createSignal(0);
  return (
    <div>
      <Show when={count() < 10} fallback={<div>Too many clicks</div>}>
        <div>
          <span>{count()}</span>
          <button onClick={() => setCount(count() + 1)}>Click me in show</button>
        </div>
      </Show>
      <Loading>
        <button onClick={() => setCount(count() + 1)}>Click me in loading</button>
      </Loading>
      <Dynamic component={Wrapper}>
        <button onClick={() => setCount(count() + 1)}>Click me in dynamic</button>
      </Dynamic>
    </div>
  );
}

export default Home;
