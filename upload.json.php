<?php

header('Content-Type: text/javascript');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
	print(json_encode(array('error' => 'POST request method only.')));
	exit;
}

if (!$_FILES['Filedata']) {
	print(json_encode(array('error' => 'Filedata field not found.')));
	exit;
}

print(json_encode($_FILES['Filedata']));

?>