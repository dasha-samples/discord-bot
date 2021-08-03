context
{
  input endpoint: string;
}

start node Root
{
  do
  {
    #connect($endpoint);
    #sayText("Hello! I will repeat what you are saying back to you.");
    wait *;
  }

  transitions
  {
    next: goto Next on true;
  }
}

node Next {
  do
  {
    #sayText("You said " + #getMessageText());
    wait *;
  }

  transitions
  {
    next: goto Next on true;
  }
}

digression Hangup
{
  conditions
  {
    on true tags: onclosed;
  }

  do
  {
    exit;
  }
}
