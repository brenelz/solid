import { createSignal, Errored, Loading, onSettled } from "solid-js";
const Home = () => {
  const [count, setCount] = createSignal(0);
  return (
    <div>
      <div>{count()}</div>
      <Show when={true}>
        <button onClick={() => setCount(count() + 1)}>Click me in first child</button>
      </Show>
      <Show when={true}>
        <button onClick={() => setCount(count() + 1)}>Click me in second child</button>
      </Show>
    </div>
  );
};

export default Home;
